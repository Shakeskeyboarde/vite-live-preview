import { build, type LogLevel } from 'vite';

import plugin from './plugin/build.js';

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
  root,
  mode,
  logLevel,
  reload,
  clearScreen,
  base,
  outDir,
  ...preview
}: Options): Promise<void> => {
  await build({
    configFile,
    root,
    logLevel,
    plugins: [plugin({ enable: true, reload })],
    clearScreen,
    // XXX: Forcing the inline config mode to be defined means that any mode
    // set in a config file will be ignored. While this is not ideal, it is
    // consistent with using the plugin with preview mode detection.
    mode: mode || 'preview',
    base,
    build: { outDir },
    preview,
  });
};
