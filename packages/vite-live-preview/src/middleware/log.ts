import { type Connect } from 'vite';

import { createDebugger } from '../util/create-debugger.js';

export default (): Connect.NextHandleFunction => {
  const debug = createDebugger('live-preview-request');

  return (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => debug?.(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`));

    next();
  };
};
