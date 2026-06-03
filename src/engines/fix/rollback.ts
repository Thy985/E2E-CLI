/**
 * Rollback Manager
 * Manages rollback points and restoration of code changes
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { createLogger, Logger } from '../../utils/logger';

export interface RollbackPoint {
  id: string;
  timestamp: number;
  projectPath: string;
  files: Map<string, string>; // filePath -> originalContent
  description: string;
}

const NEW_FILE_SENTINEL = '__NEW_FILE__';

export class RollbackManager {
  private rollbackPoints: Map<string, RollbackPoint> = new Map();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || createLogger({ level: 'info' });
  }

  /**
   * Create a rollback point before applying fixes
   */
  async createRollbackPoint(
    projectPath: string,
    affectedFiles: string[],
    description: string = 'Pre-fix rollback point'
  ): Promise<string> {
    const rollbackId = `rollback-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    this.logger.info(`Creating rollback point: ${rollbackId}`);

    const rollbackPoint: RollbackPoint = {
      id: rollbackId,
      timestamp: Date.now(),
      projectPath,
      files: new Map(),
      description,
    };

    // Store original content of all affected files
    await Promise.all(
      affectedFiles.map(async (filePath) => {
        const fullPath = path.join(projectPath, filePath);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          rollbackPoint.files.set(filePath, content);
        } catch (error) {
          const err = error as NodeJS.ErrnoException;
          if (err && err.code === 'ENOENT') {
            // Mark as new file (will be deleted on rollback)
            rollbackPoint.files.set(filePath, NEW_FILE_SENTINEL);
          } else {
            this.logger.warn(
              `Failed to read file for rollback: ${filePath}`,
              error
            );
          }
        }
      })
    );

    // Save rollback point to disk
    await this.saveRollbackPoint(rollbackPoint);
    this.rollbackPoints.set(rollbackId, rollbackPoint);

    this.logger.info(
      `Rollback point created: ${rollbackId} (${affectedFiles.length} files)`
    );
    return rollbackId;
  }

  /**
   * Restore to a rollback point
   */
  async rollback(rollbackId: string): Promise<boolean> {
    this.logger.info(`Rolling back to: ${rollbackId}`);

    const rollbackPoint =
      this.rollbackPoints.get(rollbackId) ||
      (await this.loadRollbackPoint(rollbackId));

    if (!rollbackPoint) {
      this.logger.error(`Rollback point not found: ${rollbackId}`);
      return false;
    }

    let restoredCount = 0;
    let failedCount = 0;

    for (const [filePath, originalContent] of rollbackPoint.files) {
      try {
        const fullPath = path.join(rollbackPoint.projectPath, filePath);

        if (originalContent === NEW_FILE_SENTINEL) {
          // Delete file that was created during fix
          try {
            await fs.unlink(fullPath);
            this.logger.debug(`Deleted new file: ${filePath}`);
          } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err && err.code !== 'ENOENT') {
              throw error;
            }
            this.logger.debug(`New file already gone: ${filePath}`);
          }
        } else {
          // Restore original content
          const dir = path.dirname(fullPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(fullPath, originalContent, 'utf-8');
          this.logger.debug(`Restored file: ${filePath}`);
        }
        restoredCount++;
      } catch (error) {
        this.logger.error(`Failed to rollback file: ${filePath}`, error);
        failedCount++;
      }
    }

    this.logger.info(
      `Rollback completed: ${restoredCount} restored, ${failedCount} failed`
    );

    // Clean up rollback point
    await this.deleteRollbackPoint(rollbackId);

    return failedCount === 0;
  }

  /**
   * List available rollback points
   */
  async listRollbackPoints(projectPath?: string): Promise<RollbackPoint[]> {
    const points: RollbackPoint[] = [];

    // Load from memory
    for (const point of this.rollbackPoints.values()) {
      if (!projectPath || point.projectPath === projectPath) {
        points.push(point);
      }
    }

    // Load from disk
    const rollbackDir = this.getRollbackDir();
    try {
      const files = await fs.readdir(rollbackDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const data = await fs.readFile(path.join(rollbackDir, file), 'utf-8');
          const raw = JSON.parse(data) as Omit<RollbackPoint, 'files'> & {
            files: Record<string, string>;
          };
          const point: RollbackPoint = {
            ...raw,
            files: new Map(Object.entries(raw.files)),
          };
          if (!projectPath || point.projectPath === projectPath) {
            points.push(point);
          }
        } catch (error) {
          this.logger.warn(`Failed to load rollback point: ${file}`, error);
        }
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code !== 'ENOENT') {
        this.logger.warn('Failed to read rollback directory', error);
      }
    }

    return points.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clean up old rollback points
   */
  async cleanupOldRollbackPoints(
    maxAge: number = 7 * 24 * 60 * 60 * 1000
  ): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    const points = await this.listRollbackPoints();
    for (const point of points) {
      if (now - point.timestamp > maxAge) {
        await this.deleteRollbackPoint(point.id);
        cleanedCount++;
      }
    }

    this.logger.info(`Cleaned up ${cleanedCount} old rollback points`);
    return cleanedCount;
  }

  private async saveRollbackPoint(point: RollbackPoint): Promise<void> {
    const rollbackDir = this.getRollbackDir();
    await fs.mkdir(rollbackDir, { recursive: true });

    const filePath = path.join(rollbackDir, `${point.id}.json`);
    const data = {
      ...point,
      files: Object.fromEntries(point.files), // Convert Map to object for JSON
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async loadRollbackPoint(rollbackId: string): Promise<RollbackPoint | null> {
    const filePath = path.join(this.getRollbackDir(), `${rollbackId}.json`);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const raw = JSON.parse(data) as Omit<RollbackPoint, 'files'> & {
        files: Record<string, string>;
      };
      return {
        ...raw,
        files: new Map(Object.entries(raw.files)),
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code === 'ENOENT') {
        return null;
      }
      this.logger.error(`Failed to load rollback point: ${rollbackId}`, error);
      return null;
    }
  }

  private async deleteRollbackPoint(rollbackId: string): Promise<void> {
    this.rollbackPoints.delete(rollbackId);

    const filePath = path.join(this.getRollbackDir(), `${rollbackId}.json`);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code !== 'ENOENT') {
        this.logger.warn(
          `Failed to delete rollback point file: ${filePath}`,
          error
        );
      }
    }
  }

  private getRollbackDir(): string {
    return path.join(process.cwd(), '.qa-agent', 'rollback');
  }
}

export default RollbackManager;
