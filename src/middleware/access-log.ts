import { type Connect, type Logger } from 'vite';

import { createMiddleware } from '../util/create-middleware.ts';

interface Config {
  readonly debugLogger: Logger;
}

export default function middlewareAccessLog({ debugLogger }: Config): Connect.NextHandleFunction {
  return createMiddleware((req, res) => {
    const start = Date.now();
    res.on('finish', () => debugLogger.info(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`));
  });
}
