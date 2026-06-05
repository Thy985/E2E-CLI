/**
 * Figma Integration
 * 
 * 连接设计与开发的桥梁
 */

export { FigmaClient } from './client';
export { FigmaSync } from './sync';
export { FigmaCompare } from './compare';

export type {
  FigmaConfig,
  FigmaColor,
  FigmaTextStyle,
  FigmaComponent,
} from './client';

export type {
  SyncOptions,
  DesignChange,
  SyncedComponent,
} from './sync';

export type {
  ComparisonResult,
  ComparisonItem,
} from './compare';
