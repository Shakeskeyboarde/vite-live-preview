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
  let enabled = false;
  let logger = createLogger();
  let clearScreen = false;
  let buildConfig: InlineConfig & { configFile: string | false } | undefined;
  let previewServer: PreviewServer | undefined;
  let error: Error | undefined;
  let sendTimeout: NodeJS.Timeout | undefined;

  const sockets = new Set<WebSocket>();

  const plugin: Plugin = {
    name: 'live-preview-build',
    config(config, env) {
      if (env.command === 'build' && enable !== false && (enable === true || env.mode.startsWith('preview'))) {
        enabled = true;
        debug('enabled.');

        return {
          build: {
            // Preview modes imply watching.
            watch: {
              // XXX: Default the build delay to 750ms to prevent ENOENT errors
              // on page reloads
              buildDelay: config.build?.watch?.buildDelay ?? 750,
            },
          },
        };
      }
    },
    configResolved(config) {
      logger = config.logger;

      if (!enabled) return;

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
