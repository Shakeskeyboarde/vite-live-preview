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
  let config: InlineConfig & { configFile: string | false } | undefined;
  let server: PreviewServer | undefined;
  let error: Error | undefined;
  let deferToBuild: DeferredPromise<void> | undefined;
  let deferToRequests: DeferredPromise<void> | undefined;
  let deferToRequestsDelay: NodeJS.Timeout | undefined;
  let requestCount = 0;

  const debug = createDebugger('live-preview');
  const sockets = new Set<WebSocket>();

  const plugin: Plugin = {
    name: PLUGIN_NAME,
    configResolved(resolvedConfig) {
      // Disabled if not building (serving).
      if (resolvedConfig.command !== 'build') return;
      // Disabled if not explicitly enabled and not a preview mode.
      if (enable !== true && !resolvedConfig.mode.startsWith('preview')) return;
      // Disabled if the last plugin with this plugin's name is not this
      // instance of the plugin.
      if (Array.from(resolvedConfig.plugins).reverse().find((p) => p.name === plugin.name) !== plugin) return;

      debug?.('enabled.');

      logger = resolvedConfig.logger;
      clearScreen = resolvedConfig.clearScreen !== false;

      // XXX: This is a little confusing, but to get the preview server to
      // start with the "same" config as the build, we have to grab the
      // inline config and the loaded config file (if any) from the build's
      // resolved config. These two pieces are the initial state that
      // resulted in the final build config.
      config = {
        ...resolvedConfig.inlineConfig,
        configFile: resolvedConfig.configFile ?? false,
      };

      // XXX: Technically, the resolved config should be immutable (final),
      // but it can be modified, and at least one official plugin does this
      // (@vitejs/plugin-basic-ssl).

      // Live preview implies watching.
      resolvedConfig.build.watch ??= {};
    },
    async buildStart() {
      if (!config) return;

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
      if (!config) return;

      // Save build errors to be displayed by the preview server.
      error = buildError;
    },
    async closeBundle() {
      if (!config) return;

      const buildPromise = deferToBuild?.promise;

      deferToBuild?.resolve();
      deferToBuild = undefined;

      // XXX: Make sure we don't continue until all build awaits are resolved.
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
          debug?.(`sending page-reload to ${sockets.size} clients...`);
          sockets.forEach((socket) => {
            socket.send(JSON.stringify({ type: 'page-reload' }));
            debug?.(`sent page-reload.`);
          });
        }

        return;
      }

      const onConnect = (socket: WebSocket): void => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      };

      const onRequest = (): (() => void) => {
        clearTimeout(deferToRequestsDelay);
        requestCount++;

        if (!deferToRequests) {
          deferToRequests = defer();
          debug?.('building paused.');
          void deferToRequests.promise.then(() => debug?.('building resumed.'));
        }

        return () => {
          requestCount = Math.max(0, requestCount - 1);

          if (requestCount === 0) {
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

      server = await preview({
        // Extend the build config, just adding one plugin the must precede all
        // other plugins.
        ...config,
        plugins: [
          pluginServe({ onConnect, onRequest, getError, getBuildPromise }),
          ...config.plugins ?? [],
        ],
      });

      server.config.logger.info(chalk.green('preview server started'), { timestamp: true });
      console.log();
      server.printUrls();
    },
  };

  return plugin;
};
