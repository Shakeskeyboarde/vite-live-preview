import type http from 'node:http';

import type { Mutex } from '@seahax/semaphore';
import { type Logger, type Plugin } from 'vite';
import { type WebSocket, WebSocketServer } from 'ws';

import middlewareAccessLog from '../middleware/access-log.js';
import middlewareBuildError from '../middleware/build-error.js';
import middlewareMutex from '../middleware/mutex.js';
import middlewareReload from '../middleware/reload.js';

interface Config {
  readonly mutex: Mutex<'build' | 'preview'>;
  readonly reloadEnabled: boolean;
  readonly reloadClientPort: number | undefined;
  readonly debugLogger: Logger;
  readonly getBuildError: () => Error | undefined;
  readonly onConnect: (socket: WebSocket) => void;
}

export default function pluginPreviewServerConfig({
  mutex,
  reloadEnabled,
  reloadClientPort,
  debugLogger,
  getBuildError,
  onConnect,
}: Config): Plugin {
  return {
    name: 'vite-live-preview-server-config',
    configurePreviewServer: {
      // Important that this plugin's middleware be injected into the preview
      // server first.
      order: 'pre',
      handler({ httpServer, middlewares, config }) {
        const { base } = config;

        middlewares.use(middlewareAccessLog({ debugLogger }));
        middlewares.use(middlewareMutex({ mutex }));

        if (reloadEnabled) {
          const websocketServer = new WebSocketServer({
            // XXX: Could be an HTTP/2 server. Technically, websockets
            // (specifically, the upgrade request) is not supported over
            // HTTP/2. But, the NodeJS HTTP/2 server allows HTTP/1 requests
            // (TLS ALP negotiation), so websockets still work.
            server: httpServer as http.Server,
          });

          websocketServer.on('connection', (socket) => {
            debugLogger.info(`websocket connected`);
            socket.on('close', () => debugLogger.info(`websocket disconnected (detection is not immediate)`));
            onConnect(socket);
          });

          middlewares.use(middlewareReload({ clientPort: reloadClientPort, base, debugLogger }));
        }

        middlewares.use(middlewareBuildError({ debugLogger, getBuildError }));
      },
    },
  };
}
