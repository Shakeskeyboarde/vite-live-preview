import path from 'node:path';

import ansiHtml from 'ansi-html';
import { htmlEscape } from 'escape-goat';
import { type Connect } from 'vite';

import TEMPLATE_ERROR_HTML from '../template/error.html?raw';
import { createDebugger } from '../util/create-debugger.js';
import { CLIENT_SCRIPT_NAME } from './client.js';

interface Options {
  readonly base: string;
  readonly getError: () => Error | undefined;
}

/**
 * Middleware that serves an error page when an error is present.
 */
export default ({ base, getError }: Options): Connect.NextHandleFunction => {
  const debug = createDebugger('live-preview');
  const clientSrc = JSON.stringify(path.posix.join(base, CLIENT_SCRIPT_NAME));

  return (req, res, next) => {
    if (!req.headers.accept?.includes('html')) return next();

    const error = getError();

    if (!error) return next();

    const errorMessage = ansiHtml(htmlEscape(error.message));
    const errorHtml = TEMPLATE_ERROR_HTML
      .replace(/(?=<\/head>)|$/iu, `<script crossorigin="" src=${clientSrc}></script>\n`)
      .replace(/(?=<\/body>)|$/iu, `<pre class="error"><code>${errorMessage}</code></pre>\n`);

    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', Buffer.byteLength(errorHtml, 'utf8'));
    res.end(errorHtml);
    debug?.(`served error page for "${req.url}".`);
  };
};
