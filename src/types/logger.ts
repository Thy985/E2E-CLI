/**
 * Logger contract used by Skills, Engines, and CLI commands.
 * Concrete implementation lives in `src/utils/logger.ts`.
 */
export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}
