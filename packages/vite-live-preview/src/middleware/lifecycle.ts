import { type Connect } from 'vite';

interface Options {
  readonly onRequest: () => () => void;
}

/**
 * Middleware that invokes lifecycle callbacks.
 */
export default function middleware({ onRequest }: Options): Connect.NextHandleFunction {
  return (req, res, next) => {
    let finished = false;

    const callback = onRequest();
    const onFinish = (): void => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;
      callback();
    };

    // Consider the response finished (timed out) after 5 seconds, even
    // if the 'finish' event is not emitted.
    const timeout = setTimeout(onFinish, 5000).unref();

    res.on('finish', onFinish);
    next();
  };
}
