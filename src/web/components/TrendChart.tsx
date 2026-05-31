/**
 * Trend Chart Component
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TrendChartProps {
  projectPath: string;
  height?: number;
}

export function TrendChart({ projectPath, height = 200 }: TrendChartProps) {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    loadHistory();
  }, [projectPath]);

  const loadHistory = async () => {
    try {
      const res = await fetch(`/api/history?path=${encodeURIComponent(projectPath)}`);
      const result = await res.json();
      
      const chartData = (result.history || []).map((item: any) => ({
        date: new Date(item.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        score: item.score,
        issues: item.issues,
      }));
      
      setData(chartData);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400">
        暂无历史数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }} 
          stroke="#9ca3af"
        />
        <YAxis 
          domain={[0, 100]} 
          tick={{ fontSize: 12 }} 
          stroke="#9ca3af"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
          }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
