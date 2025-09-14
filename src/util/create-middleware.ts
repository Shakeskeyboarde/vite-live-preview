import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Connect } from 'vite';

export function createMiddleware(
  middleware: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Connect.NextHandleFunction {
  return (req, res, next) => {
    Promise.resolve(middleware(req, res)).then(() => next(), (error: unknown) => next(error));
  };
}
