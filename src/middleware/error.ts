import ansiHtml from 'ansi-html';
import { htmlEscape } from 'escape-goat';
import { type Connect } from 'vite';

import TEMPLATE_ERROR_HTML from '../template/error.html?raw';
import { createDebugger } from '../util/create-debugger.js';

interface Options {
  readonly getError: () => Error | undefined;
}

/**
 * Middleware that serves an error page when an error is present.
 */
export default ({ getError }: Options): Connect.NextHandleFunction => {
  const debug = createDebugger('live-preview');

  return (req, res, next) => {
    const error = getError();

    if (!error) return next();

    if (!req.headers.accept?.includes('html')) {
      res.statusCode = 500;
      res.end();
      debug?.(`served empty error response for "${req.url}".`);

      return;
    }

    const message = ansiHtml(htmlEscape(error.message));
    const html = TEMPLATE_ERROR_HTML
      .replace(/(?=<\/body>)|$/iu, `<pre class="error"><code>${message}</code></pre>\n`);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', Buffer.byteLength(html, 'utf8'));
    res.end(html);
    debug?.(`served error page for "${req.url}".`);
  };
};
