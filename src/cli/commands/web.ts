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
    let command: string;
    
    if (platform === 'darwin') {
      command = 'open';
    } else if (platform === 'win32') {
      command = 'start';
    } else {
      command = 'xdg-open';
    }

    // Delay opening browser to ensure server is ready
    setTimeout(() => {
      spawn(command, [url], { detached: true, stdio: 'ignore' });
    }, 1000);
  }
}
