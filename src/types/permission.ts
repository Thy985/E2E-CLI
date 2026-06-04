/**
 * Permission / governance types used by engines that gate destructive actions.
 */

export type PermissionLevel = 'read-only' | 'suggest' | 'write' | 'execute';

export interface PermissionConfig {
  default: PermissionLevel;
  writeAllowList: string[];
  denyList: string[];
  commandAllowList: string[];
  commandDenyList: string[];
}

export interface Operation {
  type: 'read' | 'write' | 'execute';
  target: string;
  requiredLevel: number;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}
