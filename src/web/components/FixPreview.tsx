/**
 * Fix Preview Modal Component
 */

import React, { useState, useEffect } from 'react';

interface Issue {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  location: {
    file: string;
    line?: number;
  };
}

interface Fix {
  id: string;
  description: string;
  changes: Array<{
    file: string;
    type: string;
    oldContent?: string;
    content?: string;
  }>;
}

interface FixPreviewProps {
  issues: Issue[];
  projectPath: string;
  onClose: () => void;
  onFixed: () => void;
}

export function FixPreview({ issues, projectPath, onClose, onFixed }: FixPreviewProps) {
  const [fixes, setFixes] = useState<Array<{ fix: Fix; issue: Issue }>>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadFixes();
  }, [issues]);

  const loadFixes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fix/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issues,
          projectPath,
        }),
      });
      const data = await res.json();
      setFixes(data.fixes || []);
    } catch (error) {
      console.error('Failed to load fixes:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFixes = async () => {
    setApplying(true);
    try {
      const res = await fetch('/api/fix/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixes,
          projectPath,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        onFixed();
      }
    } catch (error) {
      console.error('Failed to apply fixes:', error);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">修复预览</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : fixes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              无法生成修复
            </div>
          ) : (
            <div className="space-y-4">
              {fixes.map(({ fix, issue }, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
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
                  <p className="text-sm text-gray-600 mb-2">{fix.description}</p>
                  {fix.changes[0] && (
                    <div className="bg-gray-50 rounded p-2 text-xs font-mono">
                      <div className="text-red-600">- {fix.changes[0].oldContent?.slice(0, 60)}...</div>
                      <div className="text-green-600">+ {fix.changes[0].content?.slice(0, 60)}...</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={applyFixes}
            disabled={loading || applying || fixes.length === 0}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {applying ? '应用中...' : `应用 ${fixes.length} 个修复`}
          </button>
        </div>
      </div>
    </div>
  );
}
