/**
 * Score Card Component
 */

import React from 'react';

interface ScoreCardProps {
  score: number;
  grade: string;
  totalIssues: number;
  critical: number;
  warning: number;
  info: number;
}

export function ScoreCard({ score, grade, totalIssues, critical, warning, info }: ScoreCardProps) {
  const gradeColors: Record<string, string> = {
    A: 'text-green-600',
    B: 'text-blue-600',
    C: 'text-yellow-600',
    D: 'text-orange-600',
    F: 'text-red-600',
  };

  const barColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-center">
        <div className={`text-5xl font-bold ${gradeColors[grade] || 'text-gray-600'}`}>
          {score}
        </div>
        <div className="mt-2 text-sm text-gray-500">质量得分</div>
        <div className={`mt-1 text-lg font-medium ${gradeColors[grade] || 'text-gray-600'}`}>
          等级 {grade}
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">总问题</span>
          <span className="font-medium text-gray-900">{totalIssues}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">严重</span>
          <span className="font-medium text-red-600">{critical}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">警告</span>
          <span className="font-medium text-yellow-600">{warning}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">建议</span>
          <span className="font-medium text-blue-600">{info}</span>
        </div>
      </div>
    </div>
  );
}
