import { createLogger, type Logger } from 'vite';

export function createDebugLogger(enabled: boolean): Logger {
  const logger = createLogger(enabled ? 'info' : 'silent', {
    prefix: '[vite-live-preview:debug]',
    allowClearScreen: false,
  });
  const info = logger.info.bind(logger);
  const warn = logger.warn.bind(logger);
  const warnOnce = logger.warnOnce.bind(logger);
  const error = logger.error.bind(logger);

  // Default to always including timestamps in debug logs.
  logger.info = (msg, options) => info(msg, { timestamp: true, ...options });
  logger.warn = (msg, options) => warn(msg, { timestamp: true, ...options });
  logger.warnOnce = (msg, options) => warnOnce(msg, { timestamp: true, ...options });
  logger.error = (msg, options) => error(msg, { timestamp: true, ...options });

  return logger;
}
