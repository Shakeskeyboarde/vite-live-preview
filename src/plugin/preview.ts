import deepCopy from '@seahax/deep-copy';
import { createMutex, type Lock } from '@seahax/semaphore';
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

import { createDebugLogger } from '../util/create-debug-logger.js';
import pluginPreviewServerConfig from './preview-server-config.js';

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
 * Start a preview server when building with file watching enabled (eg. `vite
 * build --watch`).
 */
export default function pluginPreview({
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
  let livePreviewServer: LivePreviewServer | undefined;
  let buildError: Error | undefined;
  let mutexLock: Lock | undefined;

  const debugLogger = createDebugLogger(isDebugEnabled);
  const {
    enabled: reloadEnabled = true,
    delay: reloadDelay = 1000,
    clientPort: reloadClientPort,
  } = typeof reload === 'object' ? reload : { enabled: reload };
  const mutex = createMutex<'build' | 'preview'>({
    onAcquire: (owner) => debugLogger.info(`${owner} acquired mutex`),
    onRelease: (owner) => debugLogger.info(`${owner} released mutex`),
  });

  debugLogger.info(reloadEnabled ? 'reload enabled' : 'reload disabled');
  debugLogger.info(reloadDelay > 0 ? `reload delay: ${reloadDelay}ms` : 'no reload delay');
  debugLogger.info(reloadClientPort ? `reload client port: ${reloadClientPort}` : 'automatic reload client port');

  const plugin: Plugin = {
    name: 'vite-live-preview',
    config: {
      order: 'pre',
      handler(userConfig, env) {
        // Only enabled when building.
        if (env.command !== 'build') {
          debugLogger.info('disabled (not building)');
          return;
        }

        // Only enabled if file watching is enabled.
        if (!userConfig.build?.watch && !IS_WATCHING) {
          debugLogger.info('disabled (not file watching)');
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
      logger = createLogger(resolvedConfig.logLevel, { prefix: '[vite-live-preview]' });
    },
    async buildStart() {
      if (!enabled) return;

      // Avoid building and serving at the same time.
      if (!mutexLock?.active) {
        mutexLock = await mutex.acquire('build');
      }
    },
    buildEnd(newBuildError) {
      if (!enabled) return;

      // Save build errors to be displayed by the preview server.
      buildError = newBuildError;
    },
    async closeBundle() {
      if (!enabled) return;

      mutexLock?.release();

      if (livePreviewServer) {
        livePreviewServer.reload();
        return;
      }

      livePreviewServer = await createLivePreviewServer({
        config: mergeConfig(
          { ...baseConfig, plugins: [] },
          typeof previewOverrideConfig === 'function'
            ? await previewOverrideConfig({ command: 'serve', mode, isPreview: true, isSsrBuild: false })
            : await previewOverrideConfig,
        ),
        reloadEnabled,
        reloadDelay,
        reloadClientPort,
        logger,
        debugLogger,
      });
    },
  };

  return plugin;

  async function createLivePreviewServer(
    { config, reloadEnabled, reloadDelay, reloadClientPort, logger, debugLogger }: {
      readonly config: UserConfig;
      readonly reloadEnabled: boolean;
      readonly reloadDelay: number;
      readonly reloadClientPort: number | undefined;
      readonly logger: Logger;
      readonly debugLogger: Logger;
    },
  ): Promise<LivePreviewServer> {
    const sockets = new Set<WebSocket>();

    let reloadTimeout: NodeJS.Timeout | undefined;

    const previewServerConfig = pluginPreviewServerConfig({
      mutex,
      reloadEnabled,
      reloadClientPort,
      debugLogger,
      getBuildError: () => buildError,
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

    logger.info('started', { timestamp: true });
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
        if (!reloadEnabled) return;

        debugLogger.info(`reload requested`);
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
          logger.info('reloading', { timestamp: true });
          debugLogger.info(`sending page-reload to ${sockets.size} clients`);
          for (const socket of sockets) {
            socket.send(JSON.stringify({ type: 'page-reload' }));
            debugLogger.info(`sent page-reload`);
          }
        }, reloadDelay).unref();
      },
    };
  }
}
