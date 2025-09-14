import { htmlEscape } from 'escape-goat';
import stripAnsi from 'strip-ansi';
import { type Connect, type Logger } from 'vite';

import TEMPLATE_ERROR_HTML from '../template/error.html?raw';
import { createMiddleware } from '../util/create-middleware.ts';

interface Config {
  readonly debugLogger: Logger;
  readonly getBuildError: () => Error | undefined;
}

/**
 * Middleware that serves an error page when an error is present.
 */
export default function middlewareBuildError({ debugLogger, getBuildError }: Config): Connect.NextHandleFunction {
  return createMiddleware((req, res) => {
    const error = getBuildError();

    if (!error) return;

    if (!req.headers.accept?.includes('html')) {
      res.statusCode = 500;
      res.end();
      debugLogger.info(`served empty error response for "${req.url}" (html not accepted)`);
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
    debugLogger.info(`served error page for "${req.url}"`);
  });
}
