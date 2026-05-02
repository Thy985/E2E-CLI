/**
 * Web Command
 * Starts the web dashboard
 */

import { createLogger } from '../../utils/logger';
import { createWebServer } from '../../web/server';
import { spawn } from 'child_process';

export interface WebOptions {
  port?: number;
  open?: boolean;
  path?: string;
}

export async function webCommand(options: WebOptions) {
  const logger = createLogger({ level: 'info' });
  const port = options.port || 3000;

  console.log('');
  console.log('═'.repeat(60));
  console.log('  QA-Agent Web Dashboard');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`  🌐 Server: http://localhost:${port}`);
  console.log(`  📁 Project: ${options.path || process.cwd()}`);
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  // Start the server
  const server = createWebServer(port);
  server.start();

  // Open browser if requested
  if (options.open !== false) {
    const url = `http://localhost:${port}`;
    
    // Detect platform and open browser
    const platform = process.platform;
    
    // Delay opening browser to ensure server is ready
    setTimeout(() => {
      try {
        if (platform === 'darwin') {
          spawn('open', [url], { detached: true, stdio: 'ignore' });
        } else if (platform === 'win32') {
          // Windows: use start command via cmd
          spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' });
        } else {
          spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
        }
      } catch {
        // Ignore errors when opening browser
        logger.warn(`无法自动打开浏览器，请手动访问: ${url}`);
      }
    }, 1000);
  }
}
