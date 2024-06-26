import chalk from 'chalk';
import defer, { type DeferredPromise } from 'p-defer';
import {
  type ConfigEnv,
  createLogger,
  type InlineConfig,
  loadConfigFromFile,
  mergeConfig,
  type Plugin,
  type PluginOption,
  preview,
  type PreviewServer,
  type UserConfig,
} from 'vite';
import { type WebSocket } from 'ws';

import { createDebugger } from '../util/create-debugger.js';
import pluginServe from './serve.js';

export type LivePreviewConfig =
  | Omit<UserConfig, 'plugins'>
  | null
  | ((config: UserConfig, env: ConfigEnv) => Promise<
    | Omit<UserConfig, 'plugins'>
    | null
    | void
  > | Omit<UserConfig, 'plugins'> | null | void);

export interface LivePreviewOptions {
  /**
   * Allow or disable automatic browser reloading on rebuild. The default is
   * true.
   */
  readonly reload?: boolean;
  /**
   * Configuration that should only be applied to live preview builds. This is
   * deeply merged into your regular Vite configuration.
   */
  readonly config?: LivePreviewConfig;
  /**
   * Plugins that should only be applied to the preview server.
   */
  readonly plugins?: PluginOption[];
}

/**
 * Start a preview server if the build mode is `preview` or `preview:<mode>`.
 *
 * **NOTE:** This plugin forces `build.watch` when enabled, so the Vite build
 * `--watch` option is optional/implied.
 */
export default ({ reload = true, config, plugins }: LivePreviewOptions = {}): Plugin => {
  let enabled = false;

  // resolved config
  let logger = createLogger('silent');
  let clearScreen = false;
  let mode = 'preview';
  let configFile: string | undefined;
  let inlineConfig: InlineConfig = {};

  // runtime state
  let server: PreviewServer | undefined;
  let error: Error | undefined;
  let deferToBuild: DeferredPromise<void> | undefined;
  let reloadDelay: NodeJS.Timeout | undefined;
  let deferToRequests: DeferredPromise<void> | undefined;
  let deferToRequestsDelay: NodeJS.Timeout | undefined;
  let activeRequestCount = 0;

  const debug = createDebugger('live-preview');
  const sockets = new Set<WebSocket>();

  const plugin: Plugin = {
    name: 'live-preview-build',
    config(partialConfig, env) {
      // Disabled for non-build commands (ie. serve).
      if (env.command !== 'build') return;
      // Disabled if not a preview mode.
      if (!env.mode.startsWith('preview')) return;

      enabled = true;

      // Apply the live preview only build configuration.
      return typeof config === 'function'
        ? config(partialConfig, env)
        : config;
    },
    configResolved(resolvedConfig) {
      if (!enabled) return;

      // Disable if the last plugin with this plugin's name is not this
      // instance of the plugin. The override configuration has already been
      // applied, and that's fine. But, we only want one preview server, so all
      // subsequent hooks should be no-ops.
      if (Array.from(resolvedConfig.plugins).reverse().find((p) => p.name === plugin.name) !== plugin) {
        enabled = false;
        return;
      }

      debug?.('enabled.');

      // Save the resolved config for later use.
      logger = resolvedConfig.logger;
      clearScreen = resolvedConfig.clearScreen !== false;
      mode = resolvedConfig.mode;
      configFile = resolvedConfig.configFile;
      inlineConfig = {
        ...resolvedConfig.inlineConfig,
        // XXX: Inline (JavaScript API) plugins are unsafe to reuse in the
        // preview command. This is a current limitation of Vite.
        plugins: undefined,
      };

      // Live preview implies watching.
      //
      // XXX: Technically, the resolved config should be immutable (final),
      // but it can be modified, and at least one official plugin does this
      // (@vitejs/plugin-basic-ssl).
      resolvedConfig.build.watch ??= {};
    },
    async buildStart() {
      if (!enabled) return;

      clearTimeout(reloadDelay);

      // Delay the build if requests are in progress.
      await deferToRequests?.promise;

      if (!deferToBuild) {
        deferToBuild = defer();
        debug?.('requests paused.');
        void deferToBuild.promise.then(() => debug?.('requests resumed.'));
      }

      if (clearScreen) {
        // XXX: Vite's build watch mode doesn't clear the screen before builds.
        // This seems like a bug?
        logger.clearScreen('error');
      }
    },
    buildEnd(buildError) {
      if (!enabled) return;

      // Save build errors to be displayed by the preview server.
      error = buildError;
    },
    async closeBundle() {
      if (!enabled) return;

      const buildPromise = deferToBuild?.promise;

      deferToBuild?.resolve();
      deferToBuild = undefined;

      // Continue after any other async tasks which were awaiting the promise.
      await buildPromise;

      // Signal the preview server to reload.
      if (server) {
        if (reload) {
          server.config.logger.info(chalk.green('page-reload'), { timestamp: true });
        }

        if (clearScreen) {
          server.config.logger.info(chalk.green('preview server ready'), { timestamp: true });
          console.log();
          server.printUrls();
        }

        if (reload) {
          clearTimeout(reloadDelay);
          reloadDelay = setTimeout(() => {
            debug?.(`sending page-reload to ${sockets.size} clients...`);
            sockets.forEach((socket) => {
              socket.send(JSON.stringify({ type: 'page-reload' }));
              debug?.(`sent page-reload.`);
            });
          }, 1000).unref();
        }

        return;
      }

      const onConnect = (socket: WebSocket): void => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      };

      const onRequest = (): (() => void) => {
        clearTimeout(deferToRequestsDelay);
        activeRequestCount++;

        if (!deferToRequests) {
          deferToRequests = defer();
          debug?.('building paused.');
          void deferToRequests.promise.then(() => debug?.('building resumed.'));
        }

        return () => {
          activeRequestCount = Math.max(0, activeRequestCount - 1);

          if (activeRequestCount === 0) {
            // Wait a short time to see if any new requests come in,
            // before resolving the request promise.
            clearTimeout(deferToRequestsDelay);
            deferToRequestsDelay = setTimeout(() => {
              deferToRequests?.resolve();
              deferToRequests = undefined;
            }, 500).unref();
          }
        };
      };

      const getError = (): Error | undefined => {
        return error;
      };

      const getBuildPromise = async (): Promise<void> => {
        await deferToBuild?.promise;
      };

      // Preload the preview config instead of letting the `preview()` function
      // load it. This is necessary so that the live preview plugin can be
      // injected as the first plugin.
      let previewConfig: InlineConfig = configFile
        ? await loadConfigFromFile(
          { command: 'serve', mode, isPreview: true, isSsrBuild: false },
          configFile,
          inlineConfig.root,
          inlineConfig.logLevel,
        ).then((result) => result?.config ?? {})
        : {};

      // Merge the inline config back into the loaded preview config, because
      // that's what `preview()` would do if it were allowed to load the config
      // file (disallowed below). You can think of the inline config as similar
      // to command line options, which override file config options. This is
      // in fact how the Vite CLI uses the JavaScript API's inline config.
      previewConfig = mergeConfig(previewConfig, inlineConfig);

      // The config file has already been loaded, so don't let the `preview()`
      // function load it again.
      previewConfig.configFile = false;

      // The preview command is not allowed to clear the screen. The build
      // command should do it if necessary.
      previewConfig.clearScreen = false;

      // Force the live preview plugin to be the first plugin so that it can
      // add connect middleware to the preview server first.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      previewConfig.plugins = [
        pluginServe({ onConnect, onRequest, getError, getBuildPromise }),
        ...(previewConfig.plugins ?? []),
        ...(plugins ?? []),
      ];

      server = await preview(previewConfig);
      server.config.logger.info(chalk.green('preview server started'), { timestamp: true });
      console.log();
      server.printUrls();
    },
  };

  return plugin;
};
