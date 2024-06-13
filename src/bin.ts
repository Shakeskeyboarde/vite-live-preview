import { createCommand, InvalidArgumentError } from '@commander-js/extra-typings';
import { build, type InlineConfig, loadConfigFromFile, type LogLevel, mergeConfig } from 'vite';

import { description, version } from './bin.data.js';
import plugin from './plugin.js';

const cli = createCommand('vite-live-preview')
  .description(description)
  .allowUnknownOption(false)
  .allowExcessArguments(false)
  .argument('[root]', 'specify root directory')
  .option('--host [host]', '[string] specify hostname')
  .option('--port <port>', '[number] specify port', parsePortArg)
  .option('--strictPort', '[boolean] exit if specified port is already in use')
  .option('--open [path]', '[boolean | string] open browser on startup')
  .option('--reload [boolean]', '[boolean] allow/disable automatic browser reload on rebuild', parseBooleanArg)
  .option('--outDir <dir>', '[string] output directory (default: dist)')
  .option('-c, --config <file>', '[string] use specified config file')
  .option('--base <path>', '[string] public base path (default: /)')
  .option('-l, --logLevel <level>', '[string] info | warn | error | silent', parseLogLevelArg)
  .option('--clearScreen [boolean]', '[boolean] allow/disable clear screen when logging', parseBooleanArg)
  .option('-d, --debug [feat]', '[string | boolean] show debug logs')
  .option('-f, --filter <filter>', '[string] filter debug logs')
  .option('-m, --mode <mode>', '[string] specify env mode', 'development')
  .version(version, '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display this message')
  .parse();

const [root] = cli.processedArgs;
const {
  config: configFile,
  logLevel,
  clearScreen,
  debug,
  filter,
  mode = 'development',
  base,
  outDir,
  reload,
  ...preview
} = cli.opts();

if (debug) {
  const debugValue = typeof debug === 'string'
    ? debug.split(',').map((v) => `vite:${v}`).join(',')
    : 'vite:*';

  process.env.DEBUG = `${process.env.DEBUG ? process.env.DEBUG + ',' : ''}${debugValue}`;

  if (filter) {
    process.env.VITE_DEBUG_FILTER = filter;
  }
}

// Load the configuration manually so that the `env` is correct.
const config: InlineConfig = mergeConfig<InlineConfig, InlineConfig>(
  await loadConfigFromFile(
    { command: 'build', mode, isPreview: true, isSsrBuild: false },
    configFile,
    root,
    logLevel,
  ).then((value) => value?.config ?? {}),
  {
    plugins: [plugin({ enable: true, reload })],
    root,
    configFile: false,
    logLevel,
    clearScreen,
    mode,
    base,
    build: { outDir },
    preview,
  },
);

await build(config);

function parsePortArg(value: string): number {
  const int = Number.parseInt(value, 10);

  if (!Number.isInteger(int) || int < 0 || int > 65_535) {
    throw new InvalidArgumentError('invalid port number');
  }

  return int;
}

function parseLogLevelArg(value: string): LogLevel {
  if (!(['info', 'warn', 'error', 'silent'] satisfies LogLevel[]).includes(value as LogLevel)) {
    throw new InvalidArgumentError('invalid log level');
  }

  return value as LogLevel;
}

function parseBooleanArg(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new InvalidArgumentError('invalid clear screen option');
};
