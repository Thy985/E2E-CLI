/**
 * ReportGenerator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReportGenerator, createReportGenerator } from '../../src/engines/report';
import { Diagnosis, ProjectInfo, DiagnosisType, Severity } from '../../src/types';

describe('ReportGenerator', () => {
  let reportGenerator: ReportGenerator;

  beforeEach(() => {
    reportGenerator = createReportGenerator();
  });

  describe('generate', () => {
    it('should generate report with correct structure', () => {
      const project = createMockProject();
      const issues: Diagnosis[] = [];

      const report = reportGenerator.generate(project, issues, 100);

      expect(report.version).toBe('1.0');
      expect(report.project).toEqual(project);
      expect(report.duration).toBe(100);
      expect(report.issues).toEqual(issues);
    });

    it('should calculate exit code based on issues', () => {
      const project = createMockProject();

      const noIssues = reportGenerator.generate(project, [], 100);
      expect(noIssues.exitCode).toBe(0);

      const warningIssue = createMockDiagnosis('warning');
      const warningReport = reportGenerator.generate(project, [warningIssue], 100);
      expect(warningReport.exitCode).toBe(1);

      const criticalIssue = createMockDiagnosis('critical');
      const criticalReport = reportGenerator.generate(project, [criticalIssue], 100);
      expect(criticalReport.exitCode).toBe(2);
    });
  });

  describe('generateSummary', () => {
    it('should count issues by severity', () => {
      const issues = [
        createMockDiagnosis('critical'),
        createMockDiagnosis('critical'),
        createMockDiagnosis('warning'),
        createMockDiagnosis('info'),
      ];

      const summary = reportGenerator.generateSummary(issues);

      expect(summary.totalIssues).toBe(4);
      expect(summary.critical).toBe(2);
      expect(summary.warning).toBe(1);
      expect(summary.info).toBe(1);
    });

    it('should count autoFixable issues', () => {
      const issues = [
        createMockDiagnosis('critical', true),
        createMockDiagnosis('warning', false),
        createMockDiagnosis('info', true),
      ];

      const summary = reportGenerator.generateSummary(issues);

      expect(summary.autoFixable).toBe(2);
    });
  });

  describe('formatJSON', () => {
    it('should format report as JSON', () => {
      const project = createMockProject();
      const report = reportGenerator.generate(project, [], 100);

      const json = reportGenerator.formatJSON(report);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.0');
      expect(parsed.project.name).toBe('test-project');
    });
  });

  describe('formatMarkdown', () => {
    it('should format report as Markdown', () => {
      const project = createMockProject();
      const issues = [createMockDiagnosis('critical')];
      const report = reportGenerator.generate(project, issues, 100);

      const markdown = reportGenerator.formatMarkdown(report);

      expect(markdown).toContain('# QA-Agent 诊断报告');
      expect(markdown).toContain('test-project');
      expect(markdown).toContain('100ms');
      expect(markdown).toContain('🔴');
      expect(markdown).toContain('test-title');
    });
  });

  describe('formatCompact', () => {
    it('should format report as compact text', () => {
      const project = createMockProject();
      const issues = [createMockDiagnosis('warning')];
      const report = reportGenerator.generate(project, issues, 100);

      const compact = reportGenerator.formatCompact(report);

      expect(compact).toContain('Score:');
      expect(compact).toContain('Issues:');
      expect(compact).toContain('functionality:');
    });

    it('should show check mark for no critical issues', () => {
      const project = createMockProject();
      const report = reportGenerator.generate(project, [], 100);

      const compact = reportGenerator.formatCompact(report);

      expect(compact).toContain('✓');
    });

    it('should show warning indicator for warning issues', () => {
      const project = createMockProject();
      const issues = [createMockDiagnosis('warning')];
      const report = reportGenerator.generate(project, issues, 100);

      const compact = reportGenerator.formatCompact(report);

      expect(compact).toContain('⚠');
    });
  });

  describe('formatHTML', () => {
    it('should format report as HTML', () => {
      const project = createMockProject();
      const issues = [createMockDiagnosis('critical')];
      const report = reportGenerator.generate(project, issues, 100);

      const html = reportGenerator.formatHTML(report);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('QA-Agent Report');
      expect(html).toContain('test-project');
      expect(html).toContain('Grade');
      expect(html).toContain('test-title');
    });
  });
});

function createMockProject(): ProjectInfo {
  return {
    name: 'test-project',
    path: '/test/path',
    type: 'webapp',
    framework: 'react',
  };
}

function createMockDiagnosis(
  severity: Severity = 'info',
  autoApplicable: boolean = false
): Diagnosis {
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    skill: 'test-skill',
    type: 'functionality' as DiagnosisType,
    severity,
    title: 'test-title',
    description: 'test-description',
    location: {
      file: 'test.ts',
      line: 1,
    },
    fixSuggestion: autoApplicable
      ? {
          description: 'test-fix',
          autoApplicable: true,
          riskLevel: 'low',
        }
      : undefined,
  };
}
