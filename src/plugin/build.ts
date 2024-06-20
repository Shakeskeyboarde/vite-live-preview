import chalk from 'chalk';
import defer, { type DeferredPromise } from 'p-defer';
import { createLogger, type InlineConfig, type Plugin, preview, type PreviewServer } from 'vite';
import { type WebSocket } from 'ws';

import { createDebugger } from '../util/create-debugger.js';
import pluginServe from './serve.js';

export interface PreviewModeOptions {
  /**
   * Allow or disable automatic browser reloading on rebuild. The default is
   * true.
   */
  readonly reload?: boolean;
  /**
   * Forcibly enable or disable the plugin.
   *
   * By default, the plugin is automatically enabled when the build mode is
   * `preview` or `preview:*`. If this option is set to true, then the plugin
   * is enabled even if a preview mode is not present. If this option is false,
   * then the plugin is disabled even if a preview mode is present.
   */
  readonly enable?: boolean;
}

const PLUGIN_NAME = 'live-preview-build';

/**
 * Start a preview server if the build mode is `preview` or `preview:<mode>`.
 *
 * **NOTE:** This plugin forces `build.watch` when enabled, so the Vite build
 * `--watch` option is optional/implied.
 */
export default ({ reload = true, enable }: PreviewModeOptions = {}): Plugin => {
  if (enable === false) {
    // Return a dummy plugin that does nothing if forcibly disabled.
    return { name: PLUGIN_NAME };
  }

  let logger = createLogger('silent');
  let clearScreen = false;
  let buildConfig: InlineConfig & { configFile: string | false } | undefined;
  let previewServer: PreviewServer | undefined;
  let error: Error | undefined;
  let deferredBuild: DeferredPromise<void> | undefined;
  let deferredRequests: DeferredPromise<void> | undefined;
  let deferredRequestsDelay: NodeJS.Timeout | undefined;
  let requestCount = 0;

  const debug = createDebugger('live-preview');
  const sockets = new Set<WebSocket>();

  const plugin: Plugin = {
    name: PLUGIN_NAME,
    configResolved(config) {
      // Disabled if not building (serving).
      if (config.command !== 'build') return;
      // Disabled if not explicitly enabled and not a preview mode.
      if (enable !== true && !config.mode.startsWith('preview')) return;
      // Disabled if the last plugin with this plugin's name is not this
      // instance of the plugin.
      if (Array.from(config.plugins).reverse().find((p) => p.name === plugin.name) !== plugin) return;

      debug?.('enabled.');

      logger = config.logger;
      clearScreen = config.clearScreen !== false;

      // XXX: This is a little confusing, but to get the preview server to
      // start with the "same" config as the build, we have to grab the
      // inline config and the loaded config file (if any) from the build's
      // resolved config. These two pieces are the initial state that
      // resulted in the final build config.
      buildConfig = {
        ...config.inlineConfig,
        configFile: config.configFile ?? false,
      };

      // XXX: Technically, the resolved config should be immutable (final),
      // but it can be modified, and at least one official plugin does this
      // (@vitejs/plugin-basic-ssl).

      // Live preview implies watching.
      config.build.watch ??= {};
    },
    async buildStart() {
      // Delay the build if requests are in progress.
      await deferredRequests?.promise;

      if (!deferredBuild) {
        deferredBuild = defer();
        debug?.('requests paused.');
        void deferredBuild.promise.then(() => debug?.('requests resumed.'));
      }

      if (clearScreen) {
        // XXX: Vite's build watch mode doesn't clear the screen before builds.
        // This seems like a bug?
        logger.clearScreen('error');
      }
    },
    buildEnd(buildError) {
      // Save build errors to be displayed by the preview server.
      error = buildError;
    },
    async closeBundle() {
      const buildPromise = deferredBuild?.promise;

      deferredBuild?.resolve();
      deferredBuild = undefined;

      // XXX: Make sure we don't continue until all build awaits are resolved.
      await buildPromise;

      // Signal the preview server to reload.
      if (previewServer) {
        if (reload) {
          previewServer.config.logger.info(chalk.green('page-reload'), { timestamp: true });
        }

        if (clearScreen) {
          previewServer.config.logger.info(chalk.green('preview server ready'), { timestamp: true });
          console.log();
          previewServer.printUrls();
        }

        if (reload) {
          debug?.(`sending page-reload to ${sockets.size} clients...`);
          sockets.forEach((socket) => {
            socket.send(JSON.stringify({ type: 'page-reload' }));
            debug?.(`sent page-reload.`);
          });
        }

        return;
      }

      if (!buildConfig) return;

      const onConnect = (socket: WebSocket): void => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      };

      const onRequest = (): (() => void) => {
        clearTimeout(deferredRequestsDelay);
        requestCount++;

        if (!deferredRequests) {
          deferredRequests = defer();
          debug?.('building paused.');
          void deferredRequests.promise.then(() => debug?.('building resumed.'));
        }

        return () => {
          requestCount = Math.max(0, requestCount - 1);

          if (requestCount === 0) {
            // Wait a short time to see if any new requests come in,
            // before resolving the request promise.
            clearTimeout(deferredRequestsDelay);
            deferredRequestsDelay = setTimeout(() => {
              deferredRequests?.resolve();
              deferredRequests = undefined;
            }, 500).unref();
          }
        };
      };

      const getError = (): Error | undefined => {
        return error;
      };

      const getBuildPromise = async (): Promise<void> => {
        await deferredBuild?.promise;
      };

      previewServer = await preview({
        // Extend the build config, just adding one plugin the must precede all
        // other plugins.
        ...buildConfig,
        plugins: [
          pluginServe({ onConnect, onRequest, getError, getBuildPromise }),
          ...buildConfig.plugins ?? [],
        ],
      });

      previewServer.config.logger.info(chalk.green('preview server started'), { timestamp: true });
      console.log();
      previewServer.printUrls();
    },
  };

  return plugin;
};