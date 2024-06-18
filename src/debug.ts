import chalk from 'chalk';

let isDebug: boolean | undefined;

export const debug = (message: string): void => {
  if (isDebug == null) {
    isDebug = process.env.DEBUG?.split(',').some((v) => /^vite:(?:\*|live-preview)/u.test(v)) ?? false;
  }

  if (isDebug) {
    console.debug(chalk.dim(`[live-preview] ${message}`));
  }
};
