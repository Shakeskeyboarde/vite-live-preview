import { htmlEscape } from 'escape-goat';
import stripAnsi from 'strip-ansi';
import { type Connect } from 'vite';

import TEMPLATE_ERROR_HTML from './template/error.html?raw';

interface Config {
  readonly debug: (message: string) => void;
  readonly getError: () => Error | undefined;
}

/**
 * Middleware that serves an error page when an error is present.
 */
export default function middlewareError({ debug, getError }: Config): Connect.NextHandleFunction {
  return (req, res, next) => {
    const error = getError();

    if (!error) return next();

    if (!req.headers.accept?.includes('html')) {
      res.statusCode = 500;
      res.end();
      debug(`served empty error response for "${req.url}"`);

      return;
    }

    const message = htmlEscape(stripAnsi(error.message));
    const html = TEMPLATE_ERROR_HTML
      .replace(
        /(?=<\/body>)|$/iu,
        `<div class="error"><h1>Vite Build Error</h1><pre><code>${message}</code></pre></div>\n`,
      );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', Buffer.byteLength(html, 'utf8'));
    res.end(html);
    debug(`served error page for "${req.url}"`);
  };
}
