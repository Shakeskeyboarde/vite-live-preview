import {
  createLogger,
  type Logger,
  mergeConfig,
  type Plugin,
  preview,
  type UserConfig,
  type UserConfigExport,
} from 'vite';
import { type WebSocket } from 'ws';

import pluginPreviewServerConfig from './plugin-preview-server-config.js';
import deepCopy from './util/deep-copy.js';
import createMutex, { type MutexLock } from './util/mutex.js';

interface LivePreviewServer {
  reload(): void;
}

export interface ReloadConfig {
  /**
   * If false, automatic browser reloading on rebuild will be disabled.
   * Defaults to true.
   */
  readonly enabled?: boolean;

  /**
   * Number of milliseconds to delay reloading after a build completes.
   * Defaults to 1000 (1 second).
   */
  readonly delay?: number;

  /**
   * **NOTE:** _This only affects the client! This is an advanced option that
   * can be used to bypass a reverse proxy in front of the preview server that
   * does not proxy/forward the websocket connection. This is the
   * `vite-live-preview` equivalent to the Vite `server.hmr.clientPort`
   * option._
   *
   * WebSocket connection port that the client will connect to. Defaults to the
   * local preview server port.
   */
  readonly clientPort?: number;
}

export interface LivePreviewOptions {
  /**
   * If true, debug messages will be printed to the console. Defaults to false.
   */
  readonly debug?: boolean;

  /**
   * Allow or disable automatic browser reloading on rebuild. Defaults to true.
   */
  readonly reload?: boolean | ReloadConfig;

  /**
   * Additional configuration that should only be applied only to the live
   * preview server. This is deeply merged into the inherited main Vite config.
   */
  readonly config?: UserConfigExport;
}

const IS_WATCHING = process.argv.includes('--watch') || process.argv.includes('-w');

/**
 * Start a preview server if the build mode is `preview` or `preview:<mode>`.
 *
 * **NOTE:** This plugin forces `build.watch` when enabled, so the Vite build
 * `--watch` option is optional/implied.
 */
export default function plugin({
  debug: isDebugEnabled = false,
  reload = true,
  config: previewOverrideConfig = {},
}: LivePreviewOptions = {}): Plugin {
  let enabled = false;

  // config
  let logger = createLogger('silent');
  let baseConfig: UserConfig;
  let mode: string;

  // runtime state
  let server: LivePreviewServer | undefined;
  let error: Error | undefined;
  let lock: MutexLock | undefined;

  const debug = isDebugEnabled ? (message: string) => console.debug(`[vite-live-preview] ${message}`) : () => undefined;
  const reloadConfig = typeof reload === 'object' ? reload : { enabled: reload };
  const mutex = createMutex<'build' | 'preview'>({
    onAcquire: (owner) => debug(`${owner} acquired mutex`),
    onRelease: (owner) => debug(`${owner} released mutex`),
  });
  const plugin: Plugin = {
    name: 'vite-live-preview',
    config: {
      order: 'pre',
      handler(userConfig, env) {
        // Only enabled when building.
        if (env.command !== 'build') {
          debug('disabled (not building)');
          return;
        }

        // Only enabled if file watching is enabled.
        if (!userConfig.build?.watch && !IS_WATCHING) {
          debug('disabled (not file watching)');
          return;
        }

        // Deep copy to capture a snapshot of the user config before any other
        // plugins mutate it.
        baseConfig = deepCopy(userConfig);
        mode = env.mode;
        enabled = true;
      },
    },
    configResolved(resolvedConfig) {
      // Save the resolved config for later use.
      logger = resolvedConfig.logger;
    },
    async buildStart() {
      if (!enabled) return;

      // Avoid building and serving at the same time.
      if (!lock?.active) {
        lock = await mutex.acquire('build');
      }
    },
    buildEnd(buildError) {
      if (!enabled) return;

      // Save build errors to be displayed by the preview server.
      error = buildError;
    },
    async closeBundle() {
      if (!enabled) return;

      lock?.release();

      if (server) {
        server.reload();
        return;
      }

      server = await createLivePreviewServer({
        config: mergeConfig(
          { ...baseConfig, plugins: [] },
          typeof previewOverrideConfig === 'function'
            ? await previewOverrideConfig({ command: 'serve', mode, isPreview: true, isSsrBuild: false })
            : await previewOverrideConfig,
        ),
        reloadConfig,
        logger,
        debug,
      });
    },
  };

  return plugin;

  async function createLivePreviewServer(
    { config, reloadConfig, logger, debug }: {
      readonly config: UserConfig;
      readonly reloadConfig: ReloadConfig;
      readonly logger: Logger;
      readonly debug: (message: string) => void;
    },
  ): Promise<LivePreviewServer> {
    const sockets = new Set<WebSocket>();

    let reloadTimeout: NodeJS.Timeout | undefined;

    const previewServerConfig = pluginPreviewServerConfig({
      mutex,
      reloadConfig,
      debug,
      getError: () => error,
      onConnect: (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      },
    });

    const server = await preview({
      ...config,
      configFile: false,
      clearScreen: false,
      plugins: [previewServerConfig, ...(config.plugins ?? [])],
    });

    logger.info('live preview started', { timestamp: true });
    console.log();
    server.printUrls();
    server.bindCLIShortcuts({
      print: true,
      customShortcuts: [
        {
          key: 'u',
          description: 'show server url',
          action: (self) => {
            console.log();
            self.printUrls();
          },
        },
        {
          key: 'c',
          description: 'clear console',
          action: () => logger.clearScreen('error'),
        },
      ],
    });
    console.log();

    return {
      reload() {
        if (!reloadConfig.enabled) return;

        debug(`reload requested`);
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
          logger.info('live preview reload', { timestamp: true });
          debug(`sending page-reload to ${sockets.size} clients`);
          for (const socket of sockets) {
            socket.send(JSON.stringify({ type: 'page-reload' }));
            debug(`sent page-reload`);
          }
        }, reloadConfig.delay ?? 1000).unref();
      },
    };
  }
}
