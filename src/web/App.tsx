/**
 * Main App Component
 */

import React, { useState, useEffect } from 'react';
import { Dashboard } from './pages/Dashboard';
import { DiagnosePage } from './pages/Diagnose';
import { HistoryPage } from './pages/History';

type Page = 'dashboard' | 'diagnose' | 'history';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [projectPath, setProjectPath] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');

  useEffect(() => {
    // Get project info on mount
    fetch('/api/project')
      .then(res => res.json())
      .then(data => {
        setProjectPath(data.path);
        setProjectName(data.name);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-900">
                🏥 QA-Agent
              </h1>
              <span className="text-sm text-gray-500">
                {projectName}
              </span>
            </div>
            
            <nav className="flex space-x-4">
              <button
                onClick={() => setCurrentPage('dashboard')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentPage === 'dashboard'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                仪表盘
              </button>
              <button
                onClick={() => setCurrentPage('diagnose')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentPage === 'diagnose'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                诊断
              </button>
              <button
                onClick={() => setCurrentPage('history')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentPage === 'history'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                历史
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPage === 'dashboard' && (
          <Dashboard projectPath={projectPath} />
        )}
        {currentPage === 'diagnose' && (
          <DiagnosePage projectPath={projectPath} />
        )}
        {currentPage === 'history' && (
          <HistoryPage projectPath={projectPath} />
        )}
      </main>
    </div>
  );
}
