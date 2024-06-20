import { type Connect } from 'vite';

interface Options {
  readonly getPromise: () => Promise<void>;
}

/**
 * Middleware that delays the response until a promise resolves.
 */
export default ({ getPromise }: Options): Connect.NextHandleFunction => {
  return (req, res, next) => {
    void getPromise().finally(() => next());
  };
};
