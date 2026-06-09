/**
 * Custom error types for the Fix Engine
 */

export class FixEngineError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'FixEngineError';
  }
}

export class FileNotFoundError extends FixEngineError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    this.name = 'FileNotFoundError';
  }
}

export class ContentNotFoundError extends FixEngineError {
  constructor(filePath: string, searchContent: string) {
    super(
      `Content not found in file "${filePath}": "${searchContent.substring(0, 80)}${searchContent.length > 80 ? '...' : ''}"`,
      'CONTENT_NOT_FOUND'
    );
    this.name = 'ContentNotFoundError';
  }
}

export class PreFlightValidationError extends FixEngineError {
  constructor(message: string) {
    super(`Pre-flight validation failed: ${message}`, 'PREFLIGHT_VALIDATION');
    this.name = 'PreFlightValidationError';
  }
}

export class AtomicApplyError extends FixEngineError {
  constructor(message: string, public readonly partialChanges: string[]) {
    super(`Atomic apply failed: ${message}`, 'ATOMIC_APPLY');
    this.name = 'AtomicApplyError';
  }
}

export class RollbackError extends FixEngineError {
  constructor(message: string) {
    super(`Rollback failed: ${message}`, 'ROLLBACK');
    this.name = 'RollbackError';
  }
}
