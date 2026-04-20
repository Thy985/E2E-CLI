/**
 * History Page
 */

import React, { useState, useEffect } from 'react';
import { TrendChart } from '../components/TrendChart';

interface HistoryItem {
  date: string;
  score: number;
  issues: number;
  critical: number;
  warning: number;
  grade: string;
}

interface HistoryPageProps {
  projectPath: string;
}

export function HistoryPage({ projectPath }: HistoryPageProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<string>('stable');

  useEffect(() => {
    loadHistory();
  }, [projectPath]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?path=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      setHistory(data.history || []);
      setTrend(data.trend || 'stable');
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const trendEmoji = {
    improving: '📈',
    stable: '➡️',
    declining: '📉',
  };

  const trendText = {
    improving: '正在改善',
    stable: '保持稳定',
    declining: '有所下降',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trend Indicator */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">趋势分析</h3>
            <p className="mt-1 text-sm text-gray-500">
              基于最近 {history.length} 次诊断结果
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">{trendEmoji[trend as keyof typeof trendEmoji]}</span>
            <span className="text-lg font-medium text-gray-900">
              {trendText[trend as keyof typeof trendText]}
            </span>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">得分趋势</h3>
        <TrendChart projectPath={projectPath} height={300} />
      </div>

      {/* History List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">历史记录</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {history.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              暂无历史记录
            </div>
          ) : (
            history.slice().reverse().map((item, index) => (
              <div key={index} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        item.grade === 'A' ? 'bg-green-100 text-green-800' :
                        item.grade === 'B' ? 'bg-blue-100 text-blue-800' :
                        item.grade === 'C' ? 'bg-yellow-100 text-yellow-800' :
                        item.grade === 'D' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {item.grade}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        得分: {item.score}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(item.date).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-900">{item.issues} 个问题</div>
                    <div className="text-xs text-gray-500">
                      {item.critical > 0 && (
                        <span className="text-red-600">{item.critical} 严重 </span>
                      )}
                      {item.warning > 0 && (
                        <span className="text-yellow-600">{item.warning} 警告</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
