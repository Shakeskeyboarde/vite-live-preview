import type http from 'node:http';
import path from 'node:path';

import ansiHtml from 'ansi-html';
import { htmlEscape } from 'escape-goat';
import { type Plugin } from 'vite';
import { type WebSocket, WebSocketServer } from 'ws';

import CLIENT_SCRIPT_TEMPLATE from './client.js?raw';
import { debug } from './debug.js';
import ERROR_HTML from './error.html?raw';

interface Options {
  readonly onConnected: (socket: WebSocket) => void;
  readonly getError: () => Error | undefined;
}

const RESPONSE_HOOK_SYMBOL = Symbol('vite-live-preview');
const CLIENT_SCRIPT_NAME = 'vite-live-preview/client.ts';

export default ({ onConnected, getError }: Options): Plugin => {
  return {
    name: `live-preview-serve`,
    configurePreviewServer: {
      // Important that this plugin's middleware be injected into the preview
      // server first.
      order: 'pre',
      handler(self) {
        const websocketServer = new WebSocketServer({
          // XXX: Could be an HTTP/2 server. Technically, websockets
          // (specifically, the upgrade request) is not supported over HTTP/2.
          // But, the NodeJS HTTP/2 server allows HTTP/1 requests (TLS ALP
          // negotiation), so websockets still work.
          server: self.httpServer as http.Server,
        });

        websocketServer.on('connection', (socket) => {
          debug(`connected.`);
          socket.on('message', (data) => {
            try {
              const text = (Array.isArray(data) ? Buffer.concat(data) : data instanceof Buffer ? data : Buffer.from(data)).toString('utf8');
              const message = JSON.parse(text);

              if (message?.type === 'page-reload') {
                debug('reloading...');
              }
            }
            catch {
              // ignore invalid messages
            }
          });
          socket.on('close', () => {
            debug(`disconnected.`);
          });
          onConnected(socket);
        });

        const clientScript = CLIENT_SCRIPT_TEMPLATE.replace(/(?<=const base *= *)'\/'/u, JSON.stringify(self.config.base));
        const clientScriptLength = Buffer.byteLength(clientScript, 'utf8');
        const clientScriptRoute = path.posix.join(self.config.base, CLIENT_SCRIPT_NAME);
        const clientScriptHtml = `<script crossorigin="" src=${JSON.stringify(clientScriptRoute)}></script>\n`;

        self.middlewares.use((req, res, next) => {
          const originalUrl = req.url;

          // Silently accept the client script's pings.
          if (req.headers.accept === 'text/x-vite-ping') {
            res.statusCode = 200;
            res.end();
            debug(`ping received.`);

            return;
          }

          // Serve the client script.
          if (req.url === clientScriptRoute) {
            res.setHeader('Content-Type', 'text/javascript');
            res.setHeader('Content-Length', clientScriptLength);
            res.end(clientScript);
            debug('served client script.');

            return;
          }

          // Inject the client script tag into all HTML responses.
          if (req.headers.accept?.includes('html') && !(RESPONSE_HOOK_SYMBOL in res)) {
            const error = getError();

            // If there's an error, replace all HTML content with an error page
            // that displays the error message.
            if (error) {
              const errorHtml = ERROR_HTML.replace(
                /(?<=<\/body>)|$/iu,
                `\n<pre class="error"><code>${ansiHtml(htmlEscape(error.message))}</code></pre>\n${clientScriptHtml}`,
              );

              res.statusCode = 500;
              res.setHeader('Content-Type', 'text/html');
              res.setHeader('Content-Length', Buffer.byteLength(errorHtml, 'utf8'));
              res.end(errorHtml);
              debug(`served error page for "${originalUrl}".`);

              return;
            }

            // XXX: Disable compression so we can intercept the response body.
            // Vite using compression seems to be undocumented, but it's there
            // in the source.
            req.headers['accept-encoding'] = 'identity';

            Object.assign(res, { [RESPONSE_HOOK_SYMBOL]: true });

            const chunks: Buffer[] = [];
            const writeHead = res.writeHead.bind(res);
            const write = res.write.bind(res);
            const end = res.end.bind(res);
            const push = (chunk: unknown, ...args: any[]): boolean => {
              const encoding = args.find((arg) => typeof arg === 'string');
              const callback = args.find((arg) => typeof arg === 'function');

              if (typeof chunk === 'string') {
                chunks.push(Buffer.from(chunk, encoding));
                callback?.();
                return true;
              }

              if (Buffer.isBuffer(chunk)) {
                chunks.push(chunk);
                callback?.();
                return true;
              }

              return false;
            };

            let restoreHead: (() => void) | undefined;
            let restore: (() => void) | undefined = () => {
              res.writeHead = writeHead;
              res.write = write;
              res.end = end;

              let content: string | Buffer | undefined;

              if (chunks.length) {
                const buffer = Buffer.concat(chunks);
                const text = buffer.toString('utf8');
                const injectIndex = text.search(/<\/(?:head|body|html)>/iu);

                if (injectIndex >= 0) {
                  content = text.slice(0, injectIndex) + clientScriptHtml + text.slice(injectIndex);
                  res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
                  debug(`injected client script into "${originalUrl}".`);
                }
                else {
                  content = buffer;
                  debug(`client script not injected into "${originalUrl}".`);
                }
              }

              if (restoreHead) restoreHead();
              if (content) res.write(content);

              chunks.length = 0;
              restoreHead = undefined;
              restore = undefined;
              debug(`unhooked html request "${originalUrl}".`);
            };

            res.writeHead = (...args: [any]) => {
              restoreHead = () => res.writeHead(...args);
              return res;
            };

            res.write = (chunk: unknown, ...args: any[]) => {
              if (push(chunk, ...args)) {
                return true;
              }

              // If pushing fails, it means that the chunk type wasn't
              // supported. Restore the original response. This will also
              // commit any chunks that were already pushed.
              debug(`unsupported chunk type written to "${originalUrl}".`);
              restore?.();

              return res.write(chunk, ...args);
            };

            res.end = (...args: any[]) => {
              if (args[0] != null && typeof args[0] !== 'function') {
                res.write(...args as [any?]);
              }

              // The response is finished. Restore the original response if it
              // is not already restored.
              restore?.();
              res.end();

              return res;
            };

            debug(`hooked html request "${originalUrl}".`);
          }

          next();
        });
      },
    },
  };
};
