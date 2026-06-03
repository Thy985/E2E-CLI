/**
 * Prompt registry entry point.
 *
 * Importing this module (or any specific template file) registers all
 * built-in prompts. Application code should import from here so registration
 * is guaranteed.
 */

import './ai-fix';
import './gui-actor';
import './e2e-test';

export * from './index';
