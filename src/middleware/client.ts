import path from 'node:path';

import { type Connect } from 'vite';

import TEMPLATE_CLIENT_SCRIPT from '../template/client.js?raw';
import { createDebugger } from '../util/create-debugger.js';

interface Options {
  readonly base: string;
}

export const CLIENT_SCRIPT_NAME = 'vite-live-preview/client.ts';

/**
 * Middleware that serves the client script.
 */
export default ({ base }: Options): Connect.NextHandleFunction => {
  const debug = createDebugger('live-preview');
  const clientScript = TEMPLATE_CLIENT_SCRIPT.replace(/(?<=const base *= *)'\/'/u, JSON.stringify(base));
  const clientScriptLength = Buffer.byteLength(clientScript, 'utf8');
  const clientScriptRoute = path.posix.join(base, CLIENT_SCRIPT_NAME);

  return (req, res, next) => {
    if (req.url !== clientScriptRoute) return next();

    res.setHeader('Content-Type', 'text/javascript');
    res.setHeader('Content-Length', clientScriptLength);
    res.end(clientScript);
    debug?.('served client script.');
  };
};
