import { build, type LogLevel } from 'vite';

import plugin, { type LivePreviewConfig } from './plugin/build.js';

interface Options {
  readonly config?: string;
  readonly root?: string;
  readonly logLevel?: LogLevel;
  readonly reload?: boolean;
  readonly clearScreen?: boolean;
  readonly mode?: string;
  readonly base?: string;
  readonly outDir?: string;
  readonly host?: string | true;
  readonly port?: number;
  readonly strictPort?: true;
  readonly open?: string | true;
}

export const main = async ({
  config: configFile,
  reload,
  root,
  mode = 'preview',
  logLevel,
  clearScreen,
  base,
  outDir,
  ...preview
}: Options): Promise<void> => {
  // XXX: This config is used twice, because config file loading depends on the
  // initial inline config, and this config should also be considered the live
  // preview "override" config.
  const config: LivePreviewConfig = {
    root,
    logLevel,
    clearScreen,
    mode,
    base,
    build: { outDir, watch: {} },
    preview,
  };

  await build({
    ...config,
    configFile,
    plugins: [
      plugin({ reload, config }),
    ],
  });
};
