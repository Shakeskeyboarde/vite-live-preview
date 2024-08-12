import path from 'node:path';

import { type Connect } from 'vite';

import { createDebugger } from '../util/create-debugger.js';
import { CLIENT_SCRIPT_NAME } from './client-route.js';

interface Options {
  readonly base: string;
}

const RESPONSE_HOOK_SYMBOL = Symbol('vite-live-preview');

/**
 * Middleware that injects the client script into HTML responses.
 */
export default ({ base }: Options): Connect.NextHandleFunction => {
  const debug = createDebugger('live-preview');
  const clientSrc = JSON.stringify(path.posix.join(base, CLIENT_SCRIPT_NAME));

  return (req, res, next) => {
    if (!req.headers.accept?.includes('html')) return next();

    // The response has already been hooked. Not sure why this middleware
    // would be applied to the same response multiple times, but just in
    // case.
    if (RESPONSE_HOOK_SYMBOL in res) return next();

    Object.assign(res, { [RESPONSE_HOOK_SYMBOL]: true });

    // XXX: Disable compression so we can intercept the response body.
    // Vite using compression seems to be undocumented, but it's there
    // in the source.
    req.headers['accept-encoding'] = 'identity';

    let hooked = true;
    let restoreHead: (() => void) | undefined;

    const hookedUrl = req.url;
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

    const restore: (() => void) | undefined = () => {
      if (!hooked) return;

      hooked = false;

      let content: string | Buffer | undefined;

      if (chunks.length) {
        const buffer = Buffer.concat(chunks);

        chunks.length = 0;

        const text = buffer.toString('utf8');
        const injectIndex = text.search(/<\/(?:head|body|html)>/iu);

        if (injectIndex >= 0) {
          content = text.slice(0, injectIndex);
          content += `<script src=${clientSrc}></script>\n`;
          content += text.slice(injectIndex);
          res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
          debug?.(`injected client script into "${req.url}".`);
        }
        else {
          content = buffer;
          debug?.(`client script not injected into "${req.url}".`);
        }
      }

      restoreHead?.();
      restoreHead = undefined;

      if (content) res.write(content);

      debug?.(`unhooked html request "${hookedUrl}".`);
    };

    res.writeHead = (...args: [any]) => {
      if (!hooked) return writeHead(...args);

      restoreHead = () => res.writeHead(...args);

      return res;
    };

    res.write = (chunk: unknown, ...args: any[]) => {
      if (!hooked) return write(chunk, ...args);
      if (push(chunk, ...args)) return true;

      // If pushing fails, it means that the chunk type wasn't
      // supported. Restore the original response. This will also
      // commit any chunks that were already pushed.
      debug?.(`unsupported chunk type written to "${hookedUrl}".`);
      restore?.();

      return res.write(chunk, ...args);
    };

    res.end = (...args: any[]) => {
      if (!hooked) return end(...args);

      if (args[0] != null && typeof args[0] !== 'function') {
        res.write(...args as [any?]);
      }

      // The response is finished. Restore the original response if it
      // is not already restored.
      restore?.();
      res.end();

      return res;
    };

    debug?.(`hooked html request "${hookedUrl}".`);
    next();
  };
};
