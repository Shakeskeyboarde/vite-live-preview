import type { Connect } from 'vite';

import type { Mutex, MutexLock } from './util/mutex.ts';

export interface Config {
  readonly mutex: Mutex<'build' | 'preview'>;
}

export default function middlewareMutex({ mutex }: Config): Connect.NextHandleFunction {
  let lock: MutexLock | undefined;
  let releaseTimeout: NodeJS.Timeout | undefined;
  let requestCount = 0;

  return (_req, res, next) => void (async () => {
    clearTimeout(releaseTimeout);
    requestCount += 1;

    // Avoid building and serving at the same time.
    if (!lock?.active) {
      lock = await mutex.acquire('preview');
    }

    let finished = false;

    // For the purposes of mutually exclusive building and response handling,
    // consider the response finished after a reasonable interval even if it's
    // not actually finished. This prevents the mutex from being held
    // indefinitely due to a stalled or long-running request.
    const requestTimeout = setTimeout(onFinish, 5_000).unref();

    res.once('finish', onFinish);
    res.once('error', onFinish);
    res.once('close', onFinish);

    function onFinish(): void {
      if (finished) return;

      finished = true;
      requestCount = Math.max(0, requestCount - 1);

      if (requestCount > 0) return;

      clearTimeout(requestTimeout);
      clearTimeout(releaseTimeout);

      // Wait a short time to see if any new requests come in before releasing
      // the mutex lock.
      releaseTimeout = setTimeout(() => lock?.release(), 500).unref();
    }
  })().then(() => next(), (error: unknown) => next(error));
};
