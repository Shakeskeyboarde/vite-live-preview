import chalk from 'chalk';
import { createLogger, type InlineConfig, type Plugin, preview, type PreviewServer, type WebSocket } from 'vite';

import { debug } from './debug.js';
import pluginServe from './plugin-serve.js';

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

/**
 * Start a preview server if the build mode is `preview` or `preview:<mode>`.
 *
 * **NOTE:** This plugin forces `build.watch` when enabled, so the Vite build
 * `--watch` option is optional/implied.
 */
export default ({ reload = true, enable }: PreviewModeOptions = {}): Plugin => {
  let logger = createLogger('silent');
  let clearScreen = false;
  let buildConfig: InlineConfig & { configFile: string | false } | undefined;
  let previewServer: PreviewServer | undefined;
  let error: Error | undefined;
  let sendTimeout: NodeJS.Timeout | undefined;

  const sockets = new Set<WebSocket>();

  const plugin: Plugin = {
    name: 'live-preview-build',
    configResolved(config) {
      // Disabled explicitly.
      if (enable === false) return;
      // Disabled if not building (serving).
      if (config.command !== 'build') return;
      // Disabled if not explicitly enabled and not a preview mode.
      if (enable !== true && !config.mode.startsWith('preview')) return;
      // Disabled if the last plugin with this plugin's name is not this
      // instance of the plugin.
      if (Array.from(config.plugins).reverse().find((p) => p.name === plugin.name) !== plugin) return;

      debug('enabled.');

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

      // XXX: Technically, the resolved config should be immutable (final), but
      // it can be modified, and at least one official plugin does this
      // (@vitejs/plugin-basic-ssl).

      // Preview modes imply watching.
      if (!config.build.watch) config.build.watch = {};

      // XXX: Default the build delay to 750ms to prevent ENOENT errors
      // on page reloads
      if (config.build.watch.buildDelay == null) config.build.watch.buildDelay = 750;
    },
    buildStart() {
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
      if (previewServer) {
        if (reload) {
          previewServer.config.logger.info(chalk.green('page-reload'), { timestamp: true });
          clearTimeout(sendTimeout);
          sendTimeout = setTimeout(() => {
            debug(`sending page-reload to ${sockets.size} sockets...`);
            sockets.forEach((socket) => {
              socket.send(JSON.stringify({ type: 'page-reload' }));
              debug(`sent page-reload.`);
            });
          }, 250).unref();
        }

        if (clearScreen) {
          previewServer.config.logger.info(chalk.green('preview server ready'), { timestamp: true });
          console.log();
          previewServer.printUrls();
        }

        return;
      }

      if (!buildConfig) return;

      previewServer = await preview({
        // Extend the build config, just adding one plugin the must precede all
        // other plugins.
        ...buildConfig,
        plugins: [
          pluginServe({
            onConnected: (socket) => {
              sockets.add(socket);
              socket.on('close', () => sockets.delete(socket));
            },
            getError: () => error,
          }),
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
