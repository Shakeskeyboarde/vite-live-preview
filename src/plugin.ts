import { type Server } from 'node:http';
import path from 'node:path';

import ansiHtml from 'ansi-html';
import chalk from 'chalk';
import { htmlEscape } from 'escape-goat';
import { type InlineConfig, mergeConfig, type Plugin, preview, type PreviewServer, type ResolvedConfig, type WebSocket } from 'vite';
import { WebSocketServer } from 'ws';

import CLIENT_SCRIPT_TEMPLATE from './client.js?raw';
import ERROR_HTML from './error.html?raw';

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

const RESPONSE_HOOK_SYMBOL = Symbol('vite-live-preview');
const CLIENT_SCRIPT_NAME = 'vite-live-preview/client.ts';

/**
 * Get the preview mode from a mode string. If the mode string is _NOT_
 * `preview` or does not have a `preview:` prefix, then false is returned. If a
 * mode string is `preview` or `preview:` with a zero-length suffix, then true
 * is returned. If a mode string is `preview:<suffix>`, then the suffix is
 * returned.
 */
export const getPreviewMode = (mode?: string): string | boolean => {
  const match = mode?.match(/(?<=^preview(?::|$)).*$/u);

  return match ? match[0] || true : false;
};

/**
 * Start a preview server if the build mode is `preview` or `preview:<mode>`.
 *
 * **NOTE:** This plugin forces `build.watch` when enabled, so the Vite build
 * `--watch` option is optional/implied.
 */
export default ({ reload = true, enable }: PreviewModeOptions = {}): Plugin => {
  let enabled = false;
  let resolvedConfig: ResolvedConfig | undefined;
  let previewServer: PreviewServer | undefined;
  let error: Error | undefined;
  let sendTimeout: NodeJS.Timeout | undefined;

  const sockets = new Set<WebSocket>();

  const plugin: Plugin = {
    name: 'live-preview',
    enforce: 'pre',
    config: {
      order: 'pre',
      handler(config, env) {
        const mode = getPreviewMode(env.mode);

        if (env.command === 'build' && (mode || enable === true)) {
          enabled = true;

          return {
            mode: config.mode ?? (typeof mode === 'string' ? mode : 'development'),
            build: enabled
              ? { watch: { buildDelay: config.build?.watch?.buildDelay ?? 750 } }
              : {},
          };
        }
      },
    },
    configResolved(config) {
      if (!enabled) return;

      resolvedConfig = config;
    },
    buildStart() {
      if (!resolvedConfig) return;

      if (resolvedConfig?.clearScreen !== false) {
        // XXX: Vite's build watch mode doesn't clear the screen before builds.
        // This seems like a bug.
        resolvedConfig?.logger.clearScreen('error');
      }
    },
    buildEnd(buildError) {
      if (!resolvedConfig) return;

      error = buildError;
    },
    async closeBundle() {
      if (previewServer) {
        if (reload) {
          previewServer.config.logger.info(chalk.green('page-reload'), { timestamp: true });
          clearTimeout(sendTimeout);
          sendTimeout = setTimeout(() => {
            sockets.forEach((socket) => {
              socket.send(JSON.stringify({ type: 'page-reload' }));
            });
          }, 250).unref();
        }

        if (resolvedConfig?.clearScreen !== false) {
          previewServer.config.logger.info(chalk.green('preview server ready'), { timestamp: true });
          console.log();
          previewServer.printUrls();
        }

        return;
      }

      if (!resolvedConfig) return;

      previewServer = await preview(mergeConfig<InlineConfig, InlineConfig>(
        resolvedConfig.inlineConfig,
        {
          configFile: false,
          plugins: [
            // XXX: Replaces the preview-mode plugin in the resolved build
            // configuration, with a no-op plugin. Prevents accidentally
            // starting preview servers recursively.
            {
              name: plugin.name,
              enforce: 'pre',
              configurePreviewServer: {
                order: 'pre',
                handler(self) {
                  const websocketServer = new WebSocketServer({
                    // XXX: The preview server's HTTP server _could_ be an
                    // HTTP2+ server, where websockets are deprecated. But, I
                    // _think_ that's just a typing issue, and it will always
                    // actually be an HTTP1 server, since it's a dev server and
                    // there's no real reason to use HTTP2. If it isn't an
                    // HTTP1 server, I think this will just do nothing because
                    // the server won't emit the "upgrade" event.
                    server: self.httpServer as Server,
                  });

                  websocketServer.on('connection', (socket) => {
                    sockets.add(socket);
                    socket.on('close', () => sockets.delete(socket));
                  });

                  const clientScript = CLIENT_SCRIPT_TEMPLATE.replace(/(?<=const base *= *)'\/'/u, JSON.stringify(self.config.base));
                  const clientScriptLength = Buffer.byteLength(clientScript, 'utf8');
                  const clientScriptRoute = path.posix.join(self.config.base, CLIENT_SCRIPT_NAME);
                  const clientScriptHtml = `<script src=${JSON.stringify(clientScriptRoute)}></script>\n`;

                  self.middlewares.use((req, res, next) => {
                    // Silently accept the client script's pings.
                    if (req.headers.accept === 'text/x-vite-ping') {
                      res.statusCode = 200;
                      res.end();
                      return;
                    }

                    // Serve the client script.
                    if (req.url === clientScriptRoute) {
                      res.setHeader('Content-Type', 'text/javascript');
                      res.setHeader('Content-Length', clientScriptLength);
                      res.end(clientScript);

                      return;
                    }

                    // Inject the client script tag into all HTML responses.
                    if (req.headers.accept?.includes('html') && !(RESPONSE_HOOK_SYMBOL in res)) {
                      // If there's an error, replace all HTML content with an
                      // error page that displays the error message.
                      if (error) {
                        const errorHtml = ERROR_HTML.replace(
                          /(?<=<\/body>)|$/iu,
                          `\n<pre class="error"><code>${ansiHtml(htmlEscape(error.message))}</code></pre>\n${clientScriptHtml}`,
                        );

                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'text/html');
                        res.setHeader('Content-Length', Buffer.byteLength(errorHtml, 'utf8'));
                        res.end(errorHtml);

                        return;
                      }

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
                          const injectIndex = text.search(/<\/body>/iu);

                          if (injectIndex >= 0) {
                            content = text.slice(0, injectIndex) + clientScriptHtml + text.slice(injectIndex);
                            res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
                          }
                          else {
                            content = buffer;
                          }
                        }

                        if (restoreHead) restoreHead();
                        if (content) res.write(content);

                        chunks.length = 0;
                        restoreHead = undefined;
                        restore = undefined;
                      };

                      res.writeHead = (...args: [any]) => {
                        restoreHead = () => res.writeHead(...args);
                        return res;
                      };

                      res.write = (chunk: unknown, ...args: any[]) => {
                        if (push(chunk, ...args)) {
                          return true;
                        }

                        // If pushing fails, it means that the chunk type
                        // wasn't supported. Restore the original response.
                        // This will also commit any chunks that were already
                        // pushed.
                        restore?.();

                        return res.write(chunk, ...args);
                      };

                      res.end = (...args: any[]) => {
                        if (args[0] != null && typeof args[0] !== 'function') {
                          res.write(...args as [any?]);
                        }

                        // The response is finished. Restore the original
                        // response if it is not already restored.
                        restore?.();
                        res.end();

                        return res;
                      };
                    }

                    next();
                  });
                },
              },
            },
          ],
        },
      ));

      previewServer.config.logger.info(chalk.green('preview server started'), { timestamp: true });
      console.log();
      previewServer.printUrls();
    },
  };

  return plugin;
};
