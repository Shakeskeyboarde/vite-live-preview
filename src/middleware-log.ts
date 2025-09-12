import { type Connect } from 'vite';

interface Config {
  readonly debug: (message: string) => void;
}

export default function middlewareLog({ debug }: Config): Connect.NextHandleFunction {
  return (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => debug(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`));

    next();
  };
}
