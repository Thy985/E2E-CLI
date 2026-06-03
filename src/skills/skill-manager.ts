/**
 * Skill Manager
 * Handles skill lifecycle: install, update, create, remove
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger, Logger } from '../utils/logger';
import { execAsync } from '../utils/shell';

export interface SkillPackage {
  name: string;
  version: string;
  description: string;
  author?: string;
  keywords?: string[];
  homepage?: string;
  repository?: string;
  downloads?: number;
}

export interface InstalledSkill {
  name: string;
  version: string;
  path: string;
  description: string;
  author?: string;
  enabled: boolean;
  installedAt: string;
}

export interface SkillTemplate {
  name: string;
  description: string;
  category: string;
  files: Record<string, string>;
}

export class SkillManager {
  private logger: Logger;
  private skillsDir: string;
  private configPath: string;

  constructor(logger?: Logger, projectRoot?: string) {
    this.logger = logger || createLogger({ level: 'info' });
    this.skillsDir = path.join(projectRoot || process.cwd(), '.qa-agent', 'skills');
    this.configPath = path.join(projectRoot || process.cwd(), '.qa-agent', 'skills-config.json');
    
    this.ensureSkillsDir();
  }

  private ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * Get list of installed skills
   */
  async listInstalled(): Promise<InstalledSkill[]> {
    const config = this.loadConfig();
    return config.skills || [];
  }

  /**
   * Install a skill from npm registry
   */
  async install(packageName: string, options?: { version?: string; force?: boolean }): Promise<{ success: boolean; message: string; skill?: InstalledSkill }> {
    const logger = this.logger;
    
    // Validate package name
    if (!packageName || packageName.trim() === '') {
      return { success: false, message: 'Package name is required' };
    }

    // Normalize package name (add @qa-agent/skill- prefix if needed)
    let fullPackageName = packageName;
    if (!packageName.startsWith('@') && !packageName.startsWith('qa-agent-skill-')) {
      fullPackageName = `@qa-agent/${packageName.startsWith('skill-') ? packageName : `skill-${packageName}`}`;
    }

    logger.info(`Installing skill: ${fullPackageName}`);
    
    try {
      // Check if skill is already installed
      const config = this.loadConfig();
      const existingSkill = config.skills.find(s => s.name === packageName || s.name === fullPackageName);
      
      if (existingSkill && !options?.force) {
        return { 
          success: false, 
          message: `Skill "${packageName}" is already installed (${existingSkill.version}). Use --force to reinstall.` 
        };
      }

      // Search for the package
      logger.info(`Searching for ${fullPackageName} on npm...`);
      const searchResult = await this.searchNpm(fullPackageName);
      
      if (!searchResult.exists) {
        return { 
          success: false, 
          message: `Skill "${fullPackageName}" not found on npm registry. Try searching with: npm search @qa-agent` 
        };
      }

// Create a temporary directory for npm install
      const tempDir = path.join(this.skillsDir, '.temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Use npm pack to download the package as a tarball
      logger.info(`Downloading ${searchResult.version}...`);
      let packResult;
      try {
        packResult = await execAsync(`npm pack ${fullPackageName}${options?.version ? `@${options.version}` : ''}`, { 
          cwd: tempDir, 
          timeout: 60000 
        });
      } catch (packError: any) {
        // Package might not exist or network error
        return { 
          success: false, 
          message: `Failed to download skill "${fullPackageName}". The package may not exist on npm registry or there's a network issue. Error: ${packError.message}` 
        };
      }

      // Extract the tarball filename
      const tarballName = packResult.stdout.trim();
      if (!tarballName) {
        return { success: false, message: 'Failed to download package from npm' };
      }

      const tarballPath = path.join(tempDir, tarballName);

      // Check if tarball exists
      if (!fs.existsSync(tarballPath)) {
        return { success: false, message: 'Downloaded package not found' };
      }

      // Extract the tarball - use npm's tar or built-in extraction
      logger.info(`Extracting ${tarballName}...`);
      try {
        // Try npm's tar extraction first (works cross-platform)
        await execAsync(`npm pack --dry-run "${tarballPath}"`, { cwd: tempDir, timeout: 30000 }).catch(() => {});
        
        // Use tar if available (Unix), otherwise manual extraction
        const isWindows = process.platform === 'win32';
        if (isWindows) {
          // On Windows, use PowerShell to extract tar
          await execAsync(`powershell -Command "Expand-Archive -Path '${tarballPath}' -DestinationPath '${tempDir}' -Force"`, { 
            cwd: tempDir, 
            timeout: 30000 
          });
        } else {
          await execAsync(`tar -xzf "${tarballPath}" -C "${tempDir}"`, { 
            cwd: tempDir, 
            timeout: 30000 
          });
        }
      } catch {
        // Fallback: manual tarball extraction
        logger.info('Using manual extraction...');
      }

      // Find the extracted package directory
      const dirs = fs.readdirSync(tempDir);
      let extractedDir = '';
      for (const dir of dirs) {
        // npm pack creates a directory like 'package' or '@scope/package'
        if (dir !== tarballName && (dir.startsWith('package') || dir.startsWith('@'))) {
          extractedDir = path.join(tempDir, dir);
          break;
        }
      }

      if (!extractedDir || !fs.existsSync(extractedDir)) {
        // Try finding by package.json
        for (const dir of dirs) {
          const potentialPath = path.join(tempDir, dir);
          if (fs.existsSync(path.join(potentialPath, 'package.json'))) {
            extractedDir = potentialPath;
            break;
          }
        }
      }

      if (!extractedDir || !fs.existsSync(extractedDir)) {
        return { success: false, message: 'Failed to extract package' };
      }

      // Use the extracted directory
      let skillPath = extractedDir;
      let skillName = fullPackageName.replace('@', '').replace('/', '-');

      // Read package.json to get skill info
      const pkgPath = path.join(skillPath, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        return { success: false, message: 'Invalid skill package: missing package.json' };
      }

      const pkgInfo = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      skillName = pkgInfo.name || skillName;

      // Move to skills directory
      const targetPath = path.join(this.skillsDir, skillName);
      
      // Remove existing if force
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      
      // Copy to skills directory
      this.copyDirectory(skillPath, targetPath);

      // Clean up temp
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }

      // Update config
      const skill: InstalledSkill = {
        name: skillName,
        version: pkgInfo.version || '1.0.0',
        path: targetPath,
        description: pkgInfo.description || 'No description',
        author: pkgInfo.author,
        enabled: true,
        installedAt: new Date().toISOString(),
      };

      this.addSkillToConfig(skill);

      logger.info(`✅ Skill "${skillName}" installed successfully!`);
      
      return { 
        success: true, 
        message: `Skill "${skillName}" v${skill.version} installed successfully`,
        skill 
      };

    } catch (error: any) {
      logger.error(`Failed to install skill: ${error.message}`);
      return { success: false, message: `Installation failed: ${error.message}` };
    }
  }

  /**
   * Update a skill or all skills
   */
  async update(skillName?: string): Promise<{ success: boolean; message: string; updated?: string[] }> {
    const logger = this.logger;
    const config = this.loadConfig();
    const updated: string[] = [];

    if (skillName) {
      // Update specific skill
      const skill = config.skills.find(s => s.name === skillName);
      if (!skill) {
        return { success: false, message: `Skill "${skillName}" not found` };
      }

      const result = await this.updateSkill(skill);
      if (result.success) {
        updated.push(skillName);
      }
      return { success: result.success, message: result.message, updated };
    } else {
      // Update all skills
      logger.info('Updating all installed skills...');
      
      for (const skill of config.skills) {
        const result = await this.updateSkill(skill);
        if (result.success) {
          updated.push(skill.name);
        }
      }

      if (updated.length === 0) {
        return { success: true, message: 'No skills to update or all are at latest version' };
      }

      return { 
        success: true, 
        message: `Updated ${updated.length} skill(s): ${updated.join(', ')}`,
        updated 
      };
    }
  }

  private async updateSkill(skill: InstalledSkill): Promise<{ success: boolean; message: string }> {
    const logger = this.logger;
    
    try {
      logger.info(`Updating ${skill.name}...`);
      
      // Read current version
      const pkgPath = path.join(skill.path, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        return { success: false, message: `Invalid skill: missing package.json` };
      }

      const currentPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      
      // Check for updates on npm
      const searchResult = await this.searchNpm(skill.name);
      
      if (!searchResult.exists) {
        return { success: false, message: `Skill "${skill.name}" not found on npm` };
      }

      if (searchResult.version === currentPkg.version) {
        return { success: true, message: `${skill.name} is already at latest version (${currentPkg.version})` };
      }

      // Reinstall the package using npm pack
      const tempDir = path.join(this.skillsDir, '.temp');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });

      // Download via npm pack
      const packResult = await execAsync(`npm pack ${skill.name}@latest`, { cwd: tempDir, timeout: 60000 });
      const tarballName = packResult.stdout.trim();
      
      if (!tarballName) {
        return { success: false, message: 'Failed to download update from npm' };
      }

      // Extract
      await execAsync(`tar -xzf "${tarballName}" -C "${tempDir}"`, { cwd: tempDir, timeout: 30000 });

      // Find extracted directory
      const dirs = fs.readdirSync(tempDir);
      let newPath = '';
      for (const dir of dirs) {
        const potentialPath = path.join(tempDir, dir);
        if (fs.existsSync(path.join(potentialPath, 'package.json'))) {
          newPath = potentialPath;
          break;
        }
      }

      if (newPath && fs.existsSync(path.join(newPath, 'package.json'))) {
        const newPkg = JSON.parse(fs.readFileSync(path.join(newPath, 'package.json'), 'utf-8'));
        
        // Clean and update
        fs.rmSync(skill.path, { recursive: true, force: true });
        this.copyDirectory(newPath, skill.path);

        // Update config
        skill.version = newPkg.version;
        skill.description = newPkg.description || skill.description;
        this.updateSkillInConfig(skill);

        logger.info(`✅ ${skill.name} updated to v${newPkg.version}`);

        fs.rmSync(tempDir, { recursive: true, force: true });
        return { success: true, message: `Updated ${skill.name} to v${newPkg.version}` };
      }

      return { success: false, message: `Failed to update ${skill.name}` };

    } catch (error: any) {
      return { success: false, message: `Update failed: ${error.message}` };
    }
  }

  /**
   * Create a new skill from template
   */
  async create(name: string, options?: { template?: string; description?: string }): Promise<{ success: boolean; message: string; path?: string }> {
    const logger = this.logger;

    // Validate name
    if (!name || name.trim() === '') {
      return { success: false, message: 'Skill name is required' };
    }

    // Normalize name
    const skillName = this.normalizeSkillName(name);
    
    // Check if already exists
    const config = this.loadConfig();
    if (config.skills.some(s => s.name === skillName)) {
      return { success: false, message: `Skill "${skillName}" already exists` };
    }

    // Check directory
    const skillPath = path.join(this.skillsDir, skillName);
    if (fs.existsSync(skillPath)) {
      return { success: false, message: `Directory "${skillPath}" already exists` };
    }

    try {
      logger.info(`Creating new skill: ${skillName}`);
      
      // Create skill directory
      fs.mkdirSync(skillPath, { recursive: true });
      fs.mkdirSync(path.join(skillPath, 'checkers'), { recursive: true });
      fs.mkdirSync(path.join(skillPath, 'fixers'), { recursive: true });

      const description = options?.description || `Custom skill: ${skillName}`;
      const template = options?.template || 'basic';

      // Generate skill files
      const files = this.generateSkillFiles(skillName, description, template);
      
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(skillPath, filePath);
        const dir = path.dirname(fullPath);
        
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(fullPath, content, 'utf-8');
      }

      // Add to config
      const skill: InstalledSkill = {
        name: skillName,
        version: '1.0.0',
        path: skillPath,
        description,
        enabled: true,
        installedAt: new Date().toISOString(),
      };

      this.addSkillToConfig(skill);

      logger.info(`✅ Skill "${skillName}" created successfully at ${skillPath}`);
      logger.info('');
      logger.info('Next steps:');
      logger.info(`  1. Edit ${path.join(skillPath, 'index.ts')} to implement your skill`);
      logger.info(`  2. Add checkers in ${path.join(skillPath, 'checkers')} directory`);
      logger.info(`  3. Add fixers in ${path.join(skillPath, 'fixers')} directory`);
      logger.info(`  4. Run: qa-agent skill list to see your new skill`);

      return { success: true, message: `Skill "${skillName}" created`, path: skillPath };

    } catch (error: any) {
      logger.error(`Failed to create skill: ${error.message}`);
      
      // Cleanup on failure
      if (fs.existsSync(skillPath)) {
        fs.rmSync(skillPath, { recursive: true, force: true });
      }
      
      return { success: false, message: `Creation failed: ${error.message}` };
    }
  }

  /**
   * Remove an installed skill
   */
  async remove(skillName: string): Promise<{ success: boolean; message: string }> {
    const logger = this.logger;
    const config = this.loadConfig();
    
    const skill = config.skills.find(s => s.name === skillName);
    if (!skill) {
      return { success: false, message: `Skill "${skillName}" not found` };
    }

    try {
      // Remove from filesystem
      if (fs.existsSync(skill.path)) {
        fs.rmSync(skill.path, { recursive: true, force: true });
      }

      // Update config
      config.skills = config.skills.filter(s => s.name !== skillName);
      this.saveConfig(config);

      logger.info(`✅ Skill "${skillName}" removed`);
      return { success: true, message: `Skill "${skillName}" removed` };
    } catch (error: any) {
      return { success: false, message: `Failed to remove skill: ${error.message}` };
    }
  }

  /**
   * Enable or disable a skill
   */
  async toggle(skillName: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
    const config = this.loadConfig();
    const skill = config.skills.find(s => s.name === skillName);
    
    if (!skill) {
      return { success: false, message: `Skill "${skillName}" not found` };
    }

    skill.enabled = enabled;
    this.updateSkillInConfig(skill);

    return { 
      success: true, 
      message: `Skill "${skillName}" ${enabled ? 'enabled' : 'disabled'}` 
    };
  }

  // Private helper methods

  private normalizeSkillName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private loadConfig(): { skills: InstalledSkill[] } {
    if (!fs.existsSync(this.configPath)) {
      return { skills: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {
      return { skills: [] };
    }
  }

  private saveConfig(config: { skills: InstalledSkill[] }): void {
    if (!fs.existsSync(path.dirname(this.configPath))) {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private addSkillToConfig(skill: InstalledSkill): void {
    const config = this.loadConfig();
    
    // Remove existing if present
    config.skills = config.skills.filter(s => s.name !== skill.name);
    config.skills.push(skill);
    
    this.saveConfig(config);
  }

  private updateSkillInConfig(skill: InstalledSkill): void {
    const config = this.loadConfig();
    const index = config.skills.findIndex(s => s.name === skill.name);
    
    if (index >= 0) {
      config.skills[index] = skill;
      this.saveConfig(config);
    }
  }

  private async searchNpm(packageName: string): Promise<{ exists: boolean; version: string; description?: string }> {
    try {
      const result = await execAsync(`npm view ${packageName} version description --json`, { timeout: 30000 });
      let info;
      
      try {
        info = JSON.parse(result.stdout);
      } catch {
        return { exists: false, version: '' };
      }
      
      // Check if npm returned an error response
      if (info && info.error) {
        return { exists: false, version: '' };
      }
      
      return {
        exists: true,
        version: info?.version || '1.0.0',
        description: info?.description
      };
    } catch {
      return { exists: false, version: '' };
    }
  }

  private copyDirectory(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private generateSkillFiles(name: string, description: string, template: string): Record<string, string> {
    const normalizedName = this.normalizeSkillName(name);
    const className = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('') + 'Skill';

    return {
      'package.json': JSON.stringify({
        name: `@qa-agent/skill-${normalizedName}`,
        version: '1.0.0',
        description,
        main: 'index.ts',
        keywords: ['qa-agent', 'skill'],
        author: '',
        license: 'MIT'
      }, null, 2),

      'index.ts': `/**
 * ${name} Skill
 * ${description}
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  SkillTrigger,
  SkillCapability,
  DiagnosisType,
  Severity,
} from '../../../types';
import { generateId } from '../../../utils';

export class ${className} extends BaseSkill {
  name = '${normalizedName}';
  version = '1.0.0';
  description = '${description}';

  triggers: SkillTrigger[] = [
    { type: 'command', pattern: '${normalizedName}' },
    { type: 'keyword', pattern: /${normalizedName}|${name}/i },
  ];

  capabilities: SkillCapability[] = [
    {
      name: 'diagnosis',
      description: 'Performs ${name} diagnosis',
      autoFixable: true,
      riskLevel: 'low',
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, logger } = context;

    logger.info('Starting ${name} diagnosis...');

    // TODO: Implement your diagnosis logic here
    // Example:
    // const issues = await this.checkSomething(context);
    // diagnoses.push(...issues);

    return diagnoses;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    return {
      id: \`Fix-\${generateId()}\`,
      diagnosisId: diagnosis.id,
      description: \`Fix for \${diagnosis.title}\`,
      changes: [],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }
}

// Export default instance
export default ${className};
`,

      'checkers/README.md': `# ${name} Checkers

Add your checker modules here. Each checker should focus on a specific aspect of the diagnosis.

## Checker Structure

\`\`\`typescript
export async function checkSomething(context: SkillContext) {
  const diagnoses: Diagnosis[] = [];
  
  // Implement your checks
  
  return diagnoses;
}
\`\`\`

## Available Checkers

- \`index.ts\` - Main checker that combines all checks
`,

      'fixers/README.md': `# ${name} Fixers

Add your fixer modules here. Each fixer should be able to automatically fix a specific type of issue.

## Fixer Structure

\`\`\`typescript
export async function fixSomething(issue: Diagnosis): Promise<Fix> {
  return {
    id: \`Fix-\${generateId()}\`,
    diagnosisId: issue.id,
    description: 'Description of the fix',
    changes: [],
    riskLevel: 'low',
    autoApplicable: true,
  };
}
\`\`\`

## Available Fixers

- \`index.ts\` - Main fixer that dispatches to specific fixers
`,

      'README.md': `# ${name}

${description}

## Installation

\`\`\`bash
qa-agent skill install ${normalizedName}
\`\`\`

## Usage

\`\`\`bash
qa-agent diagnose --skills ${normalizedName}
\`\`\`

## Configuration

Edit \`index.ts\` to customize the skill behavior.

## Structure

\`\`\`
${normalizedName}/
├── index.ts          # Main skill entry
├── checkers/         # Diagnosis checkers
├── fixers/          # Automatic fixers
└── README.md        # This file
\`\`\`
`
    };
  }
}

export default SkillManager;