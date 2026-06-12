import { createDashboardServer, DashboardServerOptions } from '../../engines/web-dashboard';
import { createLogger } from '../../utils/logger';
import * as path from 'path';

const logger = createLogger();

export const dashboardCommand = async (opts: {
  path: string;
  port?: number;
  host?: string;
  'enable-fix'?: boolean;
}) => {
  const options: DashboardServerOptions = {
    port: opts.port || 3900,
    host: opts.host || 'localhost',
    projectPath: path.resolve(opts.path),
    enableFixAPI: opts['enable-fix'] || false,
  };

  const server = createDashboardServer(options);
  const { url } = await server.start();
  logger.info(`Dashboard available at: ${url}`);

  process.on('SIGINT', () => {
    logger.info('Stopping dashboard...');
    server.stop();
    process.exit(0);
  });
};
