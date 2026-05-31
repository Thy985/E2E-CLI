/**
 * Issue List Component
 */

import React from 'react';

interface Issue {
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

interface IssueListProps {
  issues: Issue[];
}

export function IssueList({ issues }: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        🎉 没有发现问题
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {issues.map(issue => (
        <div key={issue.id} className="p-4 hover:bg-gray-50">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                issue.severity === 'critical' ? 'bg-red-100 text-red-600' :
                issue.severity === 'warning' ? 'bg-yellow-100 text-yellow-600' :
                'bg-blue-100 text-blue-600'
              }`}>
                {issue.severity === 'critical' ? '!' : 
                 issue.severity === 'warning' ? '⚠' : 'ℹ'}
              </span>
            </div>
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  {issue.title}
                </span>
                {issue.fixSuggestion?.autoApplicable && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    可自动修复
                  </span>
                )}
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
  );
}
