import { type Server } from 'node:http';
import path from 'node:path';

import { createCommand, InvalidArgumentError } from '@commander-js/extra-typings';
import ansiHtml from 'ansi-html';
import chalk from 'chalk';
import { htmlEscape } from 'escape-goat';
import { build, type InlineConfig, loadConfigFromFile, type Logger, type LogLevel, mergeConfig, preview, type PreviewServer, type Rollup } from 'vite';
import { type WebSocket, WebSocketServer } from 'ws';

import CLIENT_SCRIPT_TEMPLATE from './client.js?raw';
import ERROR_HTML from './error.html?raw';
import { description, version } from './index.data.js';

const RESPONSE_HOOK_SYMBOL = Symbol('vite-live-preview');
const CLIENT_SCRIPT_NAME = 'vite-live-preview/client.ts';

const cli = createCommand('vite-live-preview')
  .description(description)
  .allowUnknownOption(false)
  .allowExcessArguments(false)
  .argument('[root]', 'specify root directory')
  .option('--host [host]', '[string] specify hostname')
  .option('--port <port>', '[number] specify port', parsePortArg)
  .option('--strictPort', '[boolean] exit if specified port is already in use')
  .option('--open [path]', '[boolean | string] open browser on startup')
  .option('--reload [boolean]', '[boolean] allow/disable automatic browser reload on rebuild', parseBooleanArg)
  .option('--outDir <dir>', '[string] output directory (default: dist)')
  .option('-c, --config <file>', '[string] use specified config file')
  .option('--base <path>', '[string] public base path (default: /)')
  .option('-l, --logLevel <level>', '[string] info | warn | error | silent', parseLogLevelArg)
  .option('--clearScreen [boolean]', '[boolean] allow/disable clear screen when logging', parseBooleanArg)
  .option('-d, --debug [feat]', '[string | boolean] show debug logs')
  .option('-f, --filter <filter>', '[string] filter debug logs')
  .option('-m, --mode <mode>', '[string] specify env mode', 'development')
  .version(version, '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display this message')
  .parse();

const [root] = cli.processedArgs;
const {
  config: configFile,
  logLevel,
  clearScreen,
  debug,
  filter,
  open,
  reload: allowReload = true,
  mode = 'development',
  base,
  outDir,
  ...previewOptions
} = cli.opts();
const sockets = new Set<WebSocket>();
const reload = allowReload
  ? (): void => sockets.forEach((socket) => socket.send(JSON.stringify({ type: 'full-reload' })))
  : () => undefined;

if (debug) {
  const debugValue = typeof debug === 'string'
    ? debug.split(',').map((v) => `vite:${v}`).join(',')
    : 'vite:*';

  process.env.DEBUG = `${process.env.DEBUG ? process.env.DEBUG + ',' : ''}${debugValue}`;

  if (filter) {
    process.env.VITE_DEBUG_FILTER = filter;
  }
}

let configClearScreen = true;
let logger: Logger;
let previewServer: PreviewServer | undefined;
let error: Rollup.RollupError | undefined;

const config: InlineConfig = mergeConfig<InlineConfig, InlineConfig>(
  await loadConfigFromFile(
    { command: 'build', mode, isPreview: true, isSsrBuild: false },
    configFile,
    root,
    logLevel,
  ).then((value) => value?.config ?? {}),
  {
    root,
    configFile: false,
    logLevel,
    mode,
    base,
    build: { outDir },
  },
);

const watcher = await build(mergeConfig<InlineConfig, InlineConfig>(config, {
  clearScreen,
  build: { watch: {} },
  plugins: [
    {
      name: '__vite-live-preview:build__',
      configResolved(resolvedConfig) {
        logger = resolvedConfig.logger;
        configClearScreen = resolvedConfig.clearScreen ?? true;
      },
    },
  ],
})) as Rollup.RollupWatcher;

watcher.on('event', async (event) => {
  if (event.code === 'BUNDLE_START') {
    if (configClearScreen) {
      logger.clearScreen('error');
    }

    error = undefined;
    return;
  }

  if (event.code === 'ERROR') {
    error = event.error;
    return;
  }

  if (event.code !== 'END') {
    return;
  }

  if (previewServer) {
    reload();

    logger.info(chalk.green('page-reload'), { timestamp: true });

    if (configClearScreen) {
      console.log();
      previewServer.printUrls();
    }

    return;
  }

  previewServer = await preview(mergeConfig<InlineConfig, InlineConfig>({
    ...config,
    plugins: [
      // Must be the first plugin to ensure that middleware is added before any
      // other middleware.
      {
        name: '__vite-live-preview:preview__',
        configurePreviewServer(server) {
          const websocketServer = new WebSocketServer({
            // XXX: The preview server's HTTP server _could_ be an HTTP2+
            // server, where websockets are deprecated. But, I _think_ that's
            // just a typing issue, and it will always actually be an HTTP1
            // server, since it's a dev server and there's no real reason to
            // use HTTP2. If it isn't an HTTP1 server, I think this will just
            // do nothing because the server won't emit the "upgrade" event.
            server: server.httpServer as Server,
          });

          websocketServer.on('connection', (socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
          });

          const clientScript = CLIENT_SCRIPT_TEMPLATE.replace(/(?<=const base *= *)'\/'/u, JSON.stringify(server.config.base));
          const clientScriptLength = Buffer.byteLength(clientScript, 'utf8');
          const clientScriptRoute = path.posix.join(server.config.base, CLIENT_SCRIPT_NAME);
          const clientScriptHtml = `<script src=${JSON.stringify(clientScriptRoute)}></script>\n`;

          server.middlewares.use((req, res, next) => {
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
              // If there's an error, replace all HTML content with an error
              // page that displays the error message.
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

                // If pushing fails, it means that the chunk type wasn't
                // supported. Restore the original response. This will also
                // commit any chunks that were already pushed.
                restore?.();

                return res.write(chunk, ...args);
              };

              res.end = (...args: any[]) => {
                if (args[0] != null && typeof args[0] !== 'function') {
                  res.write(...args as [any?]);
                }

                // The response is finished. Restore the original response if
                // it is not already restored.
                restore?.();
                res.end();

                return res;
              };
            }

            next();
          });
        },
      },
      ...config.plugins ?? [],
    ],
  }, {
    clearScreen: false,
    preview: { open, ...previewOptions },
  }));

  logger.info(chalk.green('preview server started'), { timestamp: true });
  console.log();
  previewServer.printUrls();
});

function parsePortArg(value: string): number {
  const int = Number.parseInt(value, 10);

  if (!Number.isInteger(int) || int < 0 || int > 65_535) {
    throw new InvalidArgumentError('invalid port number');
  }

  return int;
}

function parseLogLevelArg(value: string): LogLevel {
  if (!(['info', 'warn', 'error', 'silent'] satisfies LogLevel[]).includes(value as LogLevel)) {
    throw new InvalidArgumentError('invalid log level');
  }

  return value as LogLevel;
}

function parseBooleanArg(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new InvalidArgumentError('invalid clear screen option');
};
