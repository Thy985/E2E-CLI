/**
 * Dashboard Page
 */

import React, { useState, useEffect } from 'react';
import { ScoreCard } from '../components/ScoreCard';
import { IssueList } from '../components/IssueList';
import { TrendChart } from '../components/TrendChart';

interface Report {
  timestamp: string;
  summary: {
    score: number;
    grade: string;
    totalIssues: number;
    critical: number;
    warning: number;
    info: number;
  };
  issues: any[];
}

interface Stats {
  totalReports: number;
  averageScore: number;
  bestScore: number;
  worstScore: number;
  totalIssues: number;
}

interface DashboardProps {
  projectPath: string;
}

export function Dashboard({ projectPath }: DashboardProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [projectPath]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      // Load latest report
      const reportRes = await fetch(`/api/report/latest?path=${encodeURIComponent(projectPath)}`);
      if (reportRes.ok) {
        const data = await reportRes.json();
        setReport(data.report);
      }

      // Load stats
      const statsRes = await fetch(`/api/history/stats?path=${encodeURIComponent(projectPath)}`);
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
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
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">总报告数</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{stats.totalReports}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">平均得分</div>
            <div className="mt-2 text-3xl font-bold text-blue-600">{stats.averageScore}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">最高得分</div>
            <div className="mt-2 text-3xl font-bold text-green-600">{stats.bestScore}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">总问题数</div>
            <div className="mt-2 text-3xl font-bold text-red-600">{stats.totalIssues}</div>
          </div>
        </div>
      )}

      {/* Latest Report */}
      {report ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Score Card */}
          <div className="lg:col-span-1">
            <ScoreCard
              score={report.summary.score}
              grade={report.summary.grade}
              totalIssues={report.summary.totalIssues}
              critical={report.summary.critical}
              warning={report.summary.warning}
              info={report.summary.info}
            />
          </div>

          {/* Trend Chart */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">历史趋势</h3>
              <TrendChart projectPath={projectPath} />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-gray-400 text-6xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">暂无诊断报告</h3>
          <p className="text-gray-500 mb-4">运行诊断以生成报告</p>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.location.reload(); }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            开始诊断
          </a>
        </div>
      )}

      {/* Issue List */}
      {report && report.issues.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">最新问题</h3>
          </div>
          <IssueList issues={report.issues.slice(0, 10)} />
        </div>
      )}
    </div>
  );
}
