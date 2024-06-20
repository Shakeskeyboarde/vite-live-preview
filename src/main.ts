import { build, type InlineConfig, loadConfigFromFile, type LogLevel, mergeConfig } from 'vite';

import plugin from './plugin/build.js';

interface Options {
  readonly mode?: string;
  readonly config?: string;
  readonly logLevel?: LogLevel;
  readonly reload?: boolean;
  readonly clearScreen?: boolean;
  readonly base?: string;
  readonly outDir?: string;
  readonly host?: string | true;
  readonly port?: number;
  readonly strictPort?: true;
  readonly open?: string | true;
}

export const main = async (root: string | undefined, {
  config: configFile,
  mode = 'development',
  logLevel,
  reload,
  clearScreen,
  base,
  outDir,
  ...preview
}: Options): Promise<void> => {
  // Load the configuration manually so that the `env` is correct.
  const config: InlineConfig = mergeConfig<InlineConfig, InlineConfig>(
    await loadConfigFromFile(
      { command: 'build', mode, isPreview: true, isSsrBuild: false },
      configFile,
      root,
      logLevel,
    ).then((value) => value?.config ?? {}),
    {
      root,
      configFile: false,
      plugins: [plugin({ enable: true, reload })],
      logLevel,
      clearScreen,
      mode,
      base,
      build: { outDir },
      preview,
    },
  );

  await build(config);
};
