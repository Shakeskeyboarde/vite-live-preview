import type http from 'node:http';

import { type Plugin } from 'vite';
import { type WebSocket, WebSocketServer } from 'ws';

import middlewareInjectInject from '../middleware/client-inject.js';
import middlewareClientRoute from '../middleware/client-route.js';
import middlewareDelay from '../middleware/delay.js';
import middlewareError from '../middleware/error.js';
import middlewareLifecycle from '../middleware/lifecycle.js';
import middlewareLog from '../middleware/log.js';
import middlewarePing from '../middleware/ping.js';
import { createDebugger } from '../util/create-debugger.js';

interface Options {
  /**
   * Called when a new websocket connection is established.
   */
  readonly onConnect: (socket: WebSocket) => void;
  /**
   * Called when a request is received. Returns a function that is called when
   * the response is finished.
   */
  readonly onRequest: () => () => void;
  /**
   * Return the current build error, if any.
   */
  readonly getError: () => Error | undefined;
  /**
   * Return a promise that resolves when no build is in progress.
   */
  readonly getBuildPromise: () => Promise<void>;
}

export default ({ onConnect, onRequest, getError, getBuildPromise }: Options): Plugin => {
  const debug = createDebugger('live-preview');

  return {
    name: `live-preview-serve`,
    configurePreviewServer: {
      // Important that this plugin's middleware be injected into the preview
      // server first.
      order: 'pre',
      handler({ httpServer, middlewares, config }) {
        const { base } = config;
        const websocketServer = new WebSocketServer({
          // XXX: Could be an HTTP/2 server. Technically, websockets
          // (specifically, the upgrade request) is not supported over HTTP/2.
          // But, the NodeJS HTTP/2 server allows HTTP/1 requests (TLS ALP
          // negotiation), so websockets still work.
          server: httpServer as http.Server,
        });

        websocketServer.on('connection', (socket) => {
          debug?.(`connected.`);
          socket.on('message', (data) => {
            try {
              const text = (Array.isArray(data) ? Buffer.concat(data) : data instanceof Buffer ? data : Buffer.from(data)).toString('utf8');
              const message = JSON.parse(text);

              if (message?.type === 'page-reload') {
                debug?.('reloading...');
              }
            }
            catch {
              // ignore invalid messages
            }
          });
          socket.on('close', () => {
            debug?.(`disconnected.`);
          });
          onConnect(socket);
        });

        middlewares
          .use(middlewareLog())
          .use(middlewarePing())
          .use(middlewareClientRoute({ base }))
          .use(middlewareDelay({ getPromise: getBuildPromise }))
          .use(middlewareLifecycle({ onRequest }))
          .use(middlewareInjectInject({ base }))
          .use(middlewareError({ getError }));
      },
    },
  };
};
