/**
 * Rollback Manager
 * Manages rollback points and restoration of code changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger, Logger } from '../../utils/logger';

export interface RollbackPoint {
  id: string;
  timestamp: number;
  projectPath: string;
  files: Map<string, string>; // filePath -> originalContent
  description: string;
}

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
    const rollbackId = `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.info(`Creating rollback point: ${rollbackId}`);

    const rollbackPoint: RollbackPoint = {
      id: rollbackId,
      timestamp: Date.now(),
      projectPath,
      files: new Map(),
      description,
    };

    // Store original content of all affected files
    for (const filePath of affectedFiles) {
      try {
        const fullPath = path.join(projectPath, filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          rollbackPoint.files.set(filePath, content);
        } else {
          // Mark as new file (will be deleted on rollback)
          rollbackPoint.files.set(filePath, '__NEW_FILE__');
        }
      } catch (error) {
        this.logger.warn(`Failed to read file for rollback: ${filePath}`, error);
      }
    }

    // Save rollback point to disk
    await this.saveRollbackPoint(rollbackPoint);
    this.rollbackPoints.set(rollbackId, rollbackPoint);

    this.logger.info(`Rollback point created: ${rollbackId} (${affectedFiles.length} files)`);
    return rollbackId;
  }

  /**
   * Restore to a rollback point
   */
  async rollback(rollbackId: string): Promise<boolean> {
    this.logger.info(`Rolling back to: ${rollbackId}`);

    const rollbackPoint = this.rollbackPoints.get(rollbackId) || 
                         await this.loadRollbackPoint(rollbackId);

    if (!rollbackPoint) {
      this.logger.error(`Rollback point not found: ${rollbackId}`);
      return false;
    }

    let restoredCount = 0;
    let failedCount = 0;

    for (const [filePath, originalContent] of rollbackPoint.files) {
      try {
        const fullPath = path.join(rollbackPoint.projectPath, filePath);
        
        if (originalContent === '__NEW_FILE__') {
          // Delete file that was created during fix
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            this.logger.debug(`Deleted new file: ${filePath}`);
          }
        } else {
          // Restore original content
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, originalContent, 'utf-8');
          this.logger.debug(`Restored file: ${filePath}`);
        }
        restoredCount++;
      } catch (error) {
        this.logger.error(`Failed to rollback file: ${filePath}`, error);
        failedCount++;
      }
    }

    this.logger.info(`Rollback completed: ${restoredCount} restored, ${failedCount} failed`);
    
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
    for (const [, point] of this.rollbackPoints) {
      if (!projectPath || point.projectPath === projectPath) {
        points.push(point);
      }
    }

    // Load from disk
    const rollbackDir = this.getRollbackDir();
    if (fs.existsSync(rollbackDir)) {
      const files = fs.readdirSync(rollbackDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = fs.readFileSync(path.join(rollbackDir, file), 'utf-8');
            const point = JSON.parse(data) as RollbackPoint;
            // Convert files array back to Map
            point.files = new Map(Object.entries(point.files));
            if (!projectPath || point.projectPath === projectPath) {
              points.push(point);
            }
          } catch (error) {
            this.logger.warn(`Failed to load rollback point: ${file}`, error);
          }
        }
      }
    }

    return points.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clean up old rollback points
   */
  async cleanupOldRollbackPoints(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
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
    if (!fs.existsSync(rollbackDir)) {
      fs.mkdirSync(rollbackDir, { recursive: true });
    }

    const filePath = path.join(rollbackDir, `${point.id}.json`);
    const data = {
      ...point,
      files: Object.fromEntries(point.files), // Convert Map to object for JSON
    };
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async loadRollbackPoint(rollbackId: string): Promise<RollbackPoint | null> {
    const filePath = path.join(this.getRollbackDir(), `${rollbackId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const point = JSON.parse(data) as RollbackPoint;
      point.files = new Map(Object.entries(point.files));
      return point;
    } catch (error) {
      this.logger.error(`Failed to load rollback point: ${rollbackId}`, error);
      return null;
    }
  }

  private async deleteRollbackPoint(rollbackId: string): Promise<void> {
    this.rollbackPoints.delete(rollbackId);
    
    const filePath = path.join(this.getRollbackDir(), `${rollbackId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  private getRollbackDir(): string {
    return path.join(process.cwd(), '.qa-agent', 'rollback');
  }
}

export default RollbackManager;
