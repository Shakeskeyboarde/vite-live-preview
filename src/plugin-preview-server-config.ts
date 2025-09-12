import type http from 'node:http';

import { type Plugin } from 'vite';
import { type WebSocket, WebSocketServer } from 'ws';

import middlewareError from './middleware-error.js';
import middlewareLog from './middleware-log.js';
import middlewareMutex from './middleware-mutex.js';
import middlewareReload from './middleware-reload.js';
import type { ReloadConfig } from './plugin.js';
import type { Mutex } from './util/mutex.js';

interface Config {
  readonly mutex: Mutex<'build' | 'preview'>;
  readonly reloadConfig: Pick<ReloadConfig, 'enabled' | 'clientPort'>;
  readonly debug: (message: string) => void;
  readonly getError: () => Error | undefined;
  readonly onConnect: (socket: WebSocket) => void;
}

export default function pluginPreviewServerConfig({
  mutex,
  reloadConfig,
  debug,
  getError,
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

        middlewares.use(middlewareLog({ debug }));
        middlewares.use(middlewareMutex({ mutex }));

        if (reloadConfig.enabled) {
          const websocketServer = new WebSocketServer({
            // XXX: Could be an HTTP/2 server. Technically, websockets
            // (specifically, the upgrade request) is not supported over
            // HTTP/2. But, the NodeJS HTTP/2 server allows HTTP/1 requests
            // (TLS ALP negotiation), so websockets still work.
            server: httpServer as http.Server,
          });

          websocketServer.on('connection', (socket) => {
            debug(`websocket connected`);
            socket.on('close', () => debug(`websocket disconnected (detection is not immediate)`));
            onConnect(socket);
          });

          middlewares.use(middlewareReload({
            port: reloadConfig.clientPort,
            base,
            debug,
          }));
        }

        middlewares.use(middlewareError({ debug, getError }));
      },
    },
  };
}
