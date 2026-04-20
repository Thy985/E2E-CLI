/**
 * Diagnose Page
 */

import React, { useState, useEffect } from 'react';
import { IssueList } from '../components/IssueList';
import { ScoreCard } from '../components/ScoreCard';
import { FixPreview } from '../components/FixPreview';

interface Skill {
  name: string;
  version: string;
  description: string;
}

interface Diagnosis {
  id: string;
  skill: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  location: {
    file: string;
    line?: number;
  };
  fixSuggestion?: {
    description: string;
    autoApplicable: boolean;
  };
}

interface DiagnosePageProps {
  projectPath: string;
}

export function DiagnosePage({ projectPath }: DiagnosePageProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(['e2e', 'a11y']);
  const [diagnosing, setDiagnosing] = useState(false);
  const [issues, setIssues] = useState<Diagnosis[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [showFixPreview, setShowFixPreview] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const res = await fetch('/api/diagnose/skills');
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  };

  const runDiagnose = async () => {
    setDiagnosing(true);
    setIssues([]);
    setScore(null);

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: projectPath,
          skills: selectedSkills,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        setIssues(data.issues || []);
        // Calculate score
        const critical = data.issues.filter((i: Diagnosis) => i.severity === 'critical').length;
        const warning = data.issues.filter((i: Diagnosis) => i.severity === 'warning').length;
        const score = Math.max(0, 100 - critical * 15 - warning * 5);
        setScore(score);
      }
    } catch (error) {
      console.error('Diagnose failed:', error);
    } finally {
      setDiagnosing(false);
    }
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills(prev => 
      prev.includes(skillName)
        ? prev.filter(s => s !== skillName)
        : [...prev, skillName]
    );
  };

  const toggleIssue = (issueId: string) => {
    setSelectedIssues(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  const autoFixableIssues = issues.filter(
    i => i.fixSuggestion?.autoApplicable && selectedIssues.has(i.id)
  );

  return (
    <div className="space-y-6">
      {/* Skill Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">选择诊断维度</h3>
        <div className="flex flex-wrap gap-2">
          {skills.map(skill => (
            <button
              key={skill.name}
              onClick={() => toggleSkill(skill.name)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedSkills.includes(skill.name)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {skill.description}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={runDiagnose}
            disabled={diagnosing || selectedSkills.length === 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {diagnosing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                诊断中...
              </>
            ) : (
              '开始诊断'
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {issues.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Score */}
          <div className="lg:col-span-1">
            {score !== null && (
              <ScoreCard
                score={score}
                grade={score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'}
                totalIssues={issues.length}
                critical={issues.filter(i => i.severity === 'critical').length}
                warning={issues.filter(i => i.severity === 'warning').length}
                info={issues.filter(i => i.severity === 'info').length}
              />
            )}
          </div>

          {/* Issues */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  发现 {issues.length} 个问题
                </h3>
                {autoFixableIssues.length > 0 && (
                  <button
                    onClick={() => setShowFixPreview(true)}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                  >
                    修复选中 ({autoFixableIssues.length})
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-200">
                {issues.map(issue => (
                  <div key={issue.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        checked={selectedIssues.has(issue.id)}
                        onChange={() => toggleIssue(issue.id)}
                        disabled={!issue.fixSuggestion?.autoApplicable}
                        className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            issue.severity === 'critical' ? 'bg-red-100 text-red-800' :
                            issue.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {issue.severity === 'critical' ? '严重' : 
                             issue.severity === 'warning' ? '警告' : '建议'}
                          </span>
                          <span className="ml-2 text-sm font-medium text-gray-900">
                            {issue.title}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{issue.description}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          📁 {issue.location.file}
                          {issue.location.line && ` :${issue.location.line}`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fix Preview Modal */}
      {showFixPreview && (
        <FixPreview
          issues={autoFixableIssues}
          projectPath={projectPath}
          onClose={() => setShowFixPreview(false)}
          onFixed={() => {
            setShowFixPreview(false);
            runDiagnose();
          }}
        />
      )}
    </div>
  );
}
