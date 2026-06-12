import { WatchEngine, WatchOptions } from '../../engines/watch';
import { createLogger } from '../../utils/logger';
import * as path from 'path';

const logger = createLogger();

export const watchCommand = async (opts: {
  path: string;
  skills?: string;
  ignore?: string;
  debounce?: number;
}) => {
  const options: WatchOptions = {
    path: path.resolve(opts.path),
    debounceMs: opts.debounce || 500,
    onDiagnostic: (diagnoses) => {
      logger.info(`Found ${diagnoses.length} issues`);
      for (const d of diagnoses) {
        logger.info(`  [${(d as any).severity || 'info'}] ${(d as any).title || d}`);
      }
    },
    onError: (error) => {
      logger.error(`Watch error: ${error.message}`);
    },
  };

  if (opts.skills) {
    options.skills = opts.skills.split(',').map(s => s.trim());
  }
  if (opts.ignore) {
    options.ignorePatterns = opts.ignore.split(',').map(p => p.trim());
  }

  const engine = new WatchEngine(options);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Stopping watch mode...');
    engine.stop();
    process.exit(0);
  });

  await engine.start();
};
