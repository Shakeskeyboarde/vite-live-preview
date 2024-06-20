import debug from 'debug';

const VITE_DEBUG_FILTER = process.env.VITE_DEBUG_FILTER;

/**
 * Creates a debug log function.
 *
 * XXX: Vite has a version of this as an internal tool, also using the `debug`
 * package. Not sure why it's not considered a public utility.
 */
export function createDebugger(
  namespace: 'live-preview' | 'live-preview-request',
): debug.Debugger['log'] | undefined {
  const log = debug(`vite:${namespace}`);

  if (!log.enabled) return;

  return (...args: [string, ...any[]]) => {
    if (!VITE_DEBUG_FILTER || args.some((a) => a?.includes?.(VITE_DEBUG_FILTER))) {
      log(...args);
    }
  };
}
