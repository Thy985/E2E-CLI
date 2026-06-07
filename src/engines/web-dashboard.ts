/**
 * Web Dashboard Server
 *
 * Lightweight HTTP server serving a real-time interactive dashboard for
 * QA-Agent reports, issues, and fix capabilities.
 *
 * Features:
 * - Interactive HTML dashboard with filtering and detail views
 * - JSON API for real-time data
 * - Server-Sent Events (SSE) for live updates
 * - Interactive fix review and application API
 */

import * as http from 'http';
import { createLogger } from '../utils/logger';
import type { EvalHistoryEntry } from './harness/eval-history';
import {
  FeedbackLoopEngine,
} from './harness/feedback-loop';

const logger = createLogger({ prefix: 'Dashboard' });

// ── Types ──────────────────────────────────────────────────────────────────

export interface DashboardServerOptions {
  port?: number;
  host?: string;
  projectPath: string;
  enableFixAPI?: boolean;
}

export interface DashboardData {
  summary: {
    score: number;
    totalIssues: number;
    critical: number;
    warning: number;
    info: number;
  };
  issues: Array<{
    id: string;
    skill: string;
    severity: string;
    title: string;
    description: string;
    file?: string;
    line?: number;
    fixSuggestion?: string;
    autoFixable?: boolean;
  }>;
  history?: EvalHistoryEntry[];
  skills: Record<string, {
    name: string;
    version: string;
    enabled: boolean;
    issueCount: number;
  }>;
}

export interface DashboardServer {
  start(): Promise<{ port: number; url: string }>;
  stop(): Promise<void>;
  getPort(): number;
  updateData(data: DashboardData): void;
}

// ── Fix state ──────────────────────────────────────────────────────────────

interface FixState {
  issueId: string;
  status: 'pending' | 'applied' | 'rejected';
  appliedAt?: string;
  diff?: string;
}

// ── SSE client tracking ────────────────────────────────────────────────────

interface SSEClient {
  id: string;
  res: http.ServerResponse;
  lastEventId: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function htmlResponse(res: http.ServerResponse, html: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
}

function sseResponse(res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
}

function sendSSE(client: SSEClient, event: string, data: unknown, id?: number): void {
  const msg = [
    `id: ${id ?? client.lastEventId++}`,
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    '',
    '',
  ].join('\n');
  client.res.write(msg);
}

function parseUrl(url: string): { pathname: string; query: Record<string, string> } {
  try {
    const u = new URL(url, 'http://localhost');
    const query: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { query[k] = v; });
    return { pathname: u.pathname, query };
  } catch {
    return { pathname: url.split('?')[0], query: {} };
  }
}

// ── HTML Dashboard Template ────────────────────────────────────────────────

function generateDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA-Agent Dashboard</title>
<style>
:root {
  --bg: #0f1117; --card: #1a1d27; --border: #2d3140;
  --text: #e1e4ed; --muted: #8b90a0;
  --green: #34d399; --red: #f87171; --yellow: #fbbf24;
  --blue: #60a5fa; --purple: #a78bfa; --orange: #fb923c;
  --radius: 8px;
}
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
}
.container { max-width: 1400px; margin: 0 auto; padding: 1.5rem 2rem; }

/* Header */
.header { display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem; padding-bottom:1rem; border-bottom:1px solid var(--border); }
.header h1 { font-size:1.5rem; display:flex; align-items:center; gap:0.5rem; }
.header h1 .dot { width:8px; height:8px; border-radius:50%; background:var(--green); animation: pulse 2s infinite; }
.header .actions { display:flex; gap:0.5rem; align-items:center; }
.header .actions button {
  background: var(--card); border:1px solid var(--border); color: var(--text);
  padding: 0.4rem 0.8rem; border-radius: var(--radius); cursor:pointer; font-size:0.8rem;
  transition: all 0.15s;
}
.header .actions button:hover { border-color: var(--blue); }
.header .actions button.active { background: var(--blue); border-color: var(--blue); }

@keyframes pulse {
  0%, 100% { opacity:1; }
  50% { opacity:0.4; }
}

/* Summary Cards */
.summary-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:2rem; }
.summary-card {
  background: var(--card); border:1px solid var(--border); border-radius: var(--radius);
  padding: 1.25rem; position:relative; overflow:hidden;
}
.summary-card .label { font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; }
.summary-card .value { font-size:2.25rem; font-weight:700; margin-top:0.25rem; }
.summary-card .sub { font-size:0.8rem; color:var(--muted); margin-top:0.25rem; }
.summary-card.critical .value { color:var(--red); }
.summary-card.warning .value { color:var(--yellow); }
.summary-card.info .value { color:var(--blue); }
.summary-card.score .value { color:var(--green); }

/* Filters */
.filters { display:flex; gap:0.75rem; margin-bottom:1rem; flex-wrap:wrap; align-items:center; }
.filters select, .filters input {
  background: var(--card); border:1px solid var(--border); color: var(--text);
  padding: 0.4rem 0.8rem; border-radius: var(--radius); font-size:0.85rem;
}
.filters select:focus, .filters input:focus { outline:none; border-color:var(--blue); }
.filters label { font-size:0.8rem; color:var(--muted); }
.filter-count { font-size:0.8rem; color:var(--muted); margin-left:auto; }

/* Issue list */
.issues-section { margin-bottom:2rem; }
.issues-section h2 { font-size:1.1rem; margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border); }
.issue-list { display:flex; flex-direction:column; gap:0.5rem; }
.issue-item {
  background: var(--card); border:1px solid var(--border); border-radius: var(--radius);
  padding: 1rem; cursor:pointer; transition: all 0.15s;
  display: grid; grid-template-columns: 1fr auto; gap:0.5rem; align-items:start;
}
.issue-item:hover { border-color: var(--blue); }
.issue-item.expanded { border-color: var(--blue); background: #1e2130; }
.issue-header { display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; }
.issue-title { font-weight:600; font-size:0.95rem; }
.issue-meta { font-size:0.8rem; color:var(--muted); display:flex; gap:0.5rem; align-items:center; }
.issue-meta .file { font-family: 'SF Mono', 'Fira Code', monospace; font-size:0.75rem; background:#252836; padding:0.1rem 0.4rem; border-radius:4px; }
.issue-desc { font-size:0.85rem; color:var(--muted); margin-top:0.5rem; grid-column: 1 / -1; }

/* Issue detail panel */
.issue-detail {
  background: var(--card); border:1px solid var(--border); border-radius: var(--radius);
  padding: 1.5rem; margin-top:1rem;
}
.issue-detail h3 { font-size:1rem; margin-bottom:1rem; }
.issue-detail .desc { margin-bottom:1rem; color:var(--muted); }
.code-block {
  background: #111318; border:1px solid var(--border); border-radius:6px;
  padding:1rem; margin:0.5rem 0; overflow-x:auto;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size:0.8rem; line-height:1.7;
}
.code-block .line-num { color:var(--muted); user-select:none; margin-right:1rem; }
.code-block .highlight { background:rgba(248,113,113,0.15); display:block; margin:0 -1rem; padding:0 1rem; }

.fix-section { margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border); }
.fix-section h4 { font-size:0.9rem; margin-bottom:0.5rem; }
.fix-actions { display:flex; gap:0.5rem; margin-top:0.75rem; }
.fix-actions button {
  padding:0.5rem 1rem; border-radius:var(--radius); border:none; cursor:pointer;
  font-size:0.85rem; font-weight:600; transition:all 0.15s;
}
.btn-apply { background:var(--green); color:#000; }
.btn-apply:hover { opacity:0.9; }
.btn-reject { background:var(--red); color:#000; }
.btn-reject:hover { opacity:0.9; }
.btn-secondary { background:var(--border); color:var(--text); }
.btn-secondary:hover { opacity:0.8; }
.fix-status { margin-top:0.5rem; font-size:0.85rem; }
.fix-status.applied { color:var(--green); }
.fix-status.rejected { color:var(--red); }

/* Skills section */
.skills-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:1rem; margin-bottom:2rem; }
.skill-card { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:1rem; }
.skill-card h4 { font-size:1rem; margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center; }
.skill-card .count { font-size:1.5rem; font-weight:700; color:var(--blue); }
.skill-card .enabled-dot { width:6px; height:6px; border-radius:50%; display:inline-block; }
.skill-card .enabled-dot.on { background:var(--green); }
.skill-card .enabled-dot.off { background:var(--red); }

/* History chart */
.history-section { margin-bottom:2rem; }
.history-section h2 { font-size:1.1rem; margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border); }
.chart-container { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:1.5rem; }
.chart-container svg { width:100%; height:auto; }

/* Tabs */
.tabs { display:flex; gap:0; margin-bottom:1rem; border-bottom:1px solid var(--border); }
.tab {
  padding:0.75rem 1.25rem; cursor:pointer; font-size:0.9rem; color:var(--muted);
  border-bottom:2px solid transparent; transition:all 0.15s;
}
.tab:hover { color:var(--text); }
.tab.active { color:var(--blue); border-bottom-color:var(--blue); }
.tab-content { display:none; }
.tab-content.active { display:block; }

/* Empty state */
.empty-state { text-align:center; padding:3rem; color:var(--muted); }
.empty-state svg { width:48px; height:48px; margin-bottom:1rem; opacity:0.5; }

/* Toast */
.toast-container { position:fixed; bottom:1.5rem; right:1.5rem; z-index:100; display:flex; flex-direction:column; gap:0.5rem; }
.toast {
  background:#1e2130; border:1px solid var(--border); border-radius:var(--radius);
  padding:0.75rem 1rem; font-size:0.85rem; animation: slideIn 0.3s ease;
  max-width:320px;
}
.toast.success { border-color:var(--green); }
.toast.error { border-color:var(--red); }
@keyframes slideIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }

/* Responsive */
@media (max-width: 768px) {
  .container { padding:1rem; }
  .summary-grid { grid-template-columns:repeat(2, 1fr); }
  .filters { flex-direction:column; align-items:stretch; }
}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1><span class="dot" id="statusDot"></span> QA-Agent Dashboard</h1>
    <div class="actions">
      <span id="lastUpdate" style="font-size:0.75rem;color:var(--muted);margin-right:0.5rem;"></span>
      <button id="refreshBtn" onclick="refreshData()">Refresh</button>
      <button id="sseToggle" class="active" onclick="toggleSSE()">Live</button>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="summary-grid" id="summaryCards">
    <div class="summary-card score"><div class="label">Quality Score</div><div class="value" id="scoreValue">--</div><div class="sub" id="scoreGrade"></div></div>
    <div class="summary-card critical"><div class="label">Critical</div><div class="value" id="criticalValue">--</div><div class="sub">needs attention</div></div>
    <div class="summary-card warning"><div class="label">Warnings</div><div class="value" id="warningValue">--</div><div class="sub">review recommended</div></div>
    <div class="summary-card info"><div class="label">Info</div><div class="value" id="infoValue">--</div><div class="sub">suggestions</div></div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <div class="tab active" data-tab="issues" onclick="switchTab('issues')">Issues</div>
    <div class="tab" data-tab="skills" onclick="switchTab('skills')">Skills</div>
    <div class="tab" data-tab="history" onclick="switchTab('history')">History</div>
    <div class="tab" data-tab="feedback" onclick="switchTab('feedback')">Feedback</div>
  </div>

  <!-- Issues Tab -->
  <div class="tab-content active" id="tab-issues">
    <div class="filters" id="filters">
      <label>Skill: <select id="filterSkill" onchange="applyFilters()"><option value="">All</option></select></label>
      <label>Severity: <select id="filterSeverity" onchange="applyFilters()"><option value="">All</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></select></label>
      <label><input type="checkbox" id="filterAutoFix" onchange="applyFilters()"> Auto-fixable only</label>
      <input type="text" id="filterSearch" placeholder="Search issues..." oninput="applyFilters()" style="min-width:200px;">
      <span class="filter-count" id="filterCount"></span>
    </div>
    <div class="issues-section">
      <div class="issue-list" id="issueList"></div>
    </div>
    <div id="issueDetailContainer"></div>
  </div>

  <!-- Skills Tab -->
  <div class="tab-content" id="tab-skills">
    <div class="skills-grid" id="skillsGrid"></div>
  </div>

  <!-- History Tab -->
  <div class="tab-content" id="tab-history">
    <div class="history-section">
      <div class="chart-container">
        <h3 style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--muted);">F1 Score Trend</h3>
        <div id="f1Chart"></div>
      </div>
      <div class="chart-container" style="margin-top:1rem;">
        <h3 style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--muted);">Pass Rate Trend</h3>
        <div id="passRateChart"></div>
      </div>
    </div>
  </div>

  <!-- Feedback Tab -->
  <div class="tab-content" id="tab-feedback">
    <div class="chart-container">
      <h3 style="margin-bottom:1rem;">Fix Feedback Stats</h3>
      <div id="feedbackStats"></div>
    </div>
  </div>
</div>

<div class="toast-container" id="toastContainer"></div>

<script>
let allIssues = [];
let filteredIssues = [];
let selectedIssueId = null;
let fixStates = {};
let sseEnabled = true;
let sse = null;

// ── Data fetching ───────────────────────────────────────────────

async function fetchData() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Failed to fetch data');
    const data = await res.json();
    allIssues = data.issues || [];
    updateSummary(data.summary);
    updateSkills(data.skills);
    updateHistory(data.history);
    applyFilters();
    updateLastUpdate();
  } catch (e) {
    console.error('Fetch error:', e);
    showToast('Failed to fetch data', 'error');
  }
}

async function fetchFeedbackStats() {
  try {
    const res = await fetch('/api/feedback');
    if (!res.ok) return;
    const stats = await res.json();
    renderFeedbackStats(stats);
  } catch {}
}

function updateLastUpdate() {
  document.getElementById('lastUpdate').textContent = 'Updated: ' + new Date().toLocaleTimeString();
}

// ── Summary ─────────────────────────────────────────────────────

function updateSummary(s) {
  if (!s) return;
  document.getElementById('scoreValue').textContent = s.score ?? '--';
  document.getElementById('criticalValue').textContent = s.critical ?? '--';
  document.getElementById('warningValue').textContent = s.warning ?? '--';
  document.getElementById('infoValue').textContent = s.info ?? '--';
  const grade = getGrade(s.score);
  document.getElementById('scoreGrade').textContent = grade ? 'Grade: ' + grade : '';
}

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ── Filters ─────────────────────────────────────────────────────

function applyFilters() {
  const skill = document.getElementById('filterSkill').value;
  const severity = document.getElementById('filterSeverity').value;
  const autoFix = document.getElementById('filterAutoFix').checked;
  const search = document.getElementById('filterSearch').value.toLowerCase();

  filteredIssues = allIssues.filter(iss => {
    if (skill && iss.skill !== skill) return false;
    if (severity && iss.severity !== severity) return false;
    if (autoFix && !iss.autoFixable) return false;
    if (search && !(iss.title + ' ' + iss.description + ' ' + (iss.file || '')).toLowerCase().includes(search)) return false;
    return true;
  });

  document.getElementById('filterCount').textContent = filteredIssues.length + ' of ' + allIssues.length + ' issues';
  renderIssueList();
}

function populateSkillFilter() {
  const skills = [...new Set(allIssues.map(i => i.skill))].sort();
  const sel = document.getElementById('filterSkill');
  const current = sel.value;
  sel.innerHTML = '<option value="">All</option>';
  skills.forEach(s => { sel.innerHTML += '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>'; });
  sel.value = current;
}

// ── Issue list ──────────────────────────────────────────────────

function renderIssueList() {
  const container = document.getElementById('issueList');
  if (filteredIssues.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No issues match current filters</p></div>';
    return;
  }
  container.innerHTML = filteredIssues.map(iss => {
    const sevColor = severityColor(iss.severity);
    return '<div class="issue-item' + (selectedIssueId === iss.id ? ' expanded' : '') + '" onclick="showIssueDetail(\\'' + iss.id + '\\')">' +
      '<div>' +
        '<div class="issue-header">' +
          '<span class="issue-title">' + escapeHtml(iss.title) + '</span>' +
          severityBadge(iss.severity) +
          (iss.autoFixable ? '<span class="badge" style="background:rgba(52,211,153,0.15);color:#34d399">Auto-fixable</span>' : '') +
        '</div>' +
        '<div class="issue-meta">' +
          '<span>' + escapeHtml(iss.skill) + '</span>' +
          (iss.file ? '<span class="file">' + escapeHtml(iss.file) + (iss.line ? ':' + iss.line : '') + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div style="color:var(--muted);font-size:0.8rem;">&rarr;</div>' +
    '</div>';
  }).join('');
}

function severityColor(s) {
  if (!s) return '#8b90a0';
  switch (s.toLowerCase()) {
    case 'critical': return '#f87171';
    case 'warning': return '#fbbf24';
    case 'info': return '#60a5fa';
    default: return '#8b90a0';
  }
}

function severityBadge(s) {
  const c = severityColor(s);
  return '<span class="badge" style="background:' + c + '22;color:' + c + '">' + escapeHtml(s) + '</span>';
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Issue detail ────────────────────────────────────────────────

async function showIssueDetail(id) {
  if (selectedIssueId === id) {
    selectedIssueId = null;
    document.getElementById('issueDetailContainer').innerHTML = '';
    renderIssueList();
    return;
  }
  selectedIssueId = id;
  renderIssueList();

  try {
    const res = await fetch('/api/issue/' + id);
    if (!res.ok) { showToast('Issue not found', 'error'); return; }
    const issue = await res.json();
    renderIssueDetail(issue);
  } catch (e) {
    showToast('Failed to load issue', 'error');
  }
}

function renderIssueDetail(issue) {
  const container = document.getElementById('issueDetailContainer');
  const fs = fixStates[issue.id] || { status: 'pending' };

  let fixHtml = '';
  if (issue.fixSuggestion) {
    fixHtml = '<div class="fix-section">' +
      '<h4>Fix Suggestion</h4>' +
      '<div class="code-block">' + escapeHtml(issue.fixSuggestion).split('\\n').map(l => '<div>' + escapeHtml(l) + '</div>').join('') + '</div>' +
      '<div class="fix-actions">' +
        '<button class="btn-apply" onclick="applyFix(\\'' + issue.id + '\\')" ' + (fs.status !== 'pending' ? 'disabled' : '') + '>Apply Fix</button>' +
        '<button class="btn-reject" onclick="rejectFix(\\'' + issue.id + '\\')" ' + (fs.status !== 'pending' ? 'disabled' : '') + '>Reject</button>' +
      '</div>';
    if (fs.status === 'applied') {
      fixHtml += '<div class="fix-status applied">Fix applied at ' + (fs.appliedAt || '') + '</div>';
    } else if (fs.status === 'rejected') {
      fixHtml += '<div class="fix-status rejected">Fix rejected</div>';
    }
    fixHtml += '</div>';
  }

  const codeHtml = issue.file ? '<div class="code-block"><span class="line-num">' + (issue.line || '?') + '</span><span class="highlight">' + escapeHtml(issue.description) + '</span></div>' : '';

  container.innerHTML = '<div class="issue-detail">' +
    '<h3>' + escapeHtml(issue.title) + ' ' + severityBadge(issue.severity) + '</h3>' +
    '<div class="desc">' + escapeHtml(issue.description) + '</div>' +
    (issue.file ? '<div class="issue-meta" style="margin-bottom:1rem;"><span class="file">' + escapeHtml(issue.file) + (issue.line ? ':' + issue.line : '') + '</span></div>' : '') +
    codeHtml +
    fixHtml +
  '</div>';
}

// ── Fix actions ─────────────────────────────────────────────────

async function applyFix(id) {
  try {
    const res = await fetch('/api/fix/' + id, { method: 'POST' });
    const result = await res.json();
    if (res.ok) {
      fixStates[id] = { status: 'applied', appliedAt: new Date().toLocaleTimeString(), diff: result.diff };
      renderIssueDetail(allIssues.find(i => i.id === id));
      showToast('Fix applied successfully', 'success');
    } else {
      showToast(result.error || 'Failed to apply fix', 'error');
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
}

async function rejectFix(id) {
  try {
    const res = await fetch('/api/fix/' + id + '/reject', { method: 'POST' });
    const result = await res.json();
    if (res.ok) {
      fixStates[id] = { status: 'rejected' };
      renderIssueDetail(allIssues.find(i => i.id === id));
      showToast('Fix rejected', 'success');
    } else {
      showToast(result.error || 'Failed to reject fix', 'error');
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
}

// ── Skills ──────────────────────────────────────────────────────

function updateSkills(skills) {
  const grid = document.getElementById('skillsGrid');
  if (!skills || Object.keys(skills).length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No skill data available</p></div>';
    return;
  }
  grid.innerHTML = Object.values(skills).map(sk => {
    const enabledDot = sk.enabled ? '<span class="enabled-dot on"></span>' : '<span class="enabled-dot off"></span>';
    return '<div class="skill-card">' +
      '<h4>' + escapeHtml(sk.name) + ' ' + enabledDot + '</h4>' +
      '<div class="count">' + sk.issueCount + '</div>' +
      '<div style="font-size:0.8rem;color:var(--muted);">v' + escapeHtml(sk.version) + ' · ' + (sk.enabled ? 'enabled' : 'disabled') + '</div>' +
    '</div>';
  }).join('');
}

// ── History charts ──────────────────────────────────────────────

function updateHistory(history) {
  if (!history || history.length === 0) {
    document.getElementById('f1Chart').innerHTML = '<div class="empty-state"><p>No evaluation history yet</p></div>';
    document.getElementById('passRateChart').innerHTML = '';
    return;
  }
  const reversed = [...history].reverse();
  document.getElementById('f1Chart').innerHTML = generateLineChart(reversed.map(e => ({ value: (e.avgF1 ?? 0) * 100, label: formatDate(e.timestamp) })), '#60a5fa');
  document.getElementById('passRateChart').innerHTML = generateLineChart(reversed.map(e => ({ value: (e.passRate ?? 0) * 100, label: formatDate(e.timestamp) })), '#34d399');
}

function generateLineChart(data, color) {
  if (!data || data.length === 0) return '';
  const w = 800, h = 200;
  const pad = { top: 20, right: 20, bottom: 40, left: 50 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const minV = Math.min(...data.map(d => d.value), 0);
  const maxV = Math.max(...data.map(d => d.value), 100);
  const range = maxV - minV || 1;

  const pts = data.map((d, i) => {
    const x = pad.left + (data.length === 1 ? cw / 2 : (i / (data.length - 1)) * cw);
    const y = pad.top + ch - ((d.value - minV) / range) * ch;
    return { x, y, label: d.label };
  });

  const pathD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.y).join(' ');

  const gridLines = [0, 25, 50, 75, 100].map(v => {
    const y = pad.top + ch - ((v - minV) / range) * ch;
    if (y >= pad.top && y <= pad.top + ch) {
      return '<line x1="' + pad.left + '" y1="' + y + '" x2="' + (w - pad.right) + '" y2="' + y + '" stroke="#2d3140" stroke-width="1"/>' +
        '<text x="' + (pad.left - 8) + '" y="' + (y + 4) + '" fill="#8b90a0" font-size="10" text-anchor="end">' + v + '</text>';
    }
    return '';
  }).join('');

  const dots = pts.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="' + color + '" stroke="#0f1117" stroke-width="2"/>').join('');

  const xLabels = pts.filter((_, i) => data.length <= 8 || i % Math.ceil(data.length / 8) === 0)
    .map(p => '<text x="' + p.x + '" y="' + (h - 8) + '" fill="#8b90a0" font-size="9" text-anchor="middle">' + p.label + '</text>').join('');

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
    gridLines +
    '<path d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    dots + xLabels + '</svg>';
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Feedback ────────────────────────────────────────────────────

function renderFeedbackStats(stats) {
  if (!stats || stats.totalFeedbacks === 0) {
    document.getElementById('feedbackStats').innerHTML = '<div class="empty-state"><p>No feedback data yet</p></div>';
    return;
  }
  const acceptRate = ((stats.acceptRate || 0) * 100).toFixed(1);
  const rejectRate = ((stats.rejectRate || 0) * 100).toFixed(1);
  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:1.5rem;">' +
    '<div><div style="font-size:0.75rem;color:var(--muted);">Total</div><div style="font-size:1.5rem;font-weight:700;">' + stats.totalFeedbacks + '</div></div>' +
    '<div><div style="font-size:0.75rem;color:var(--muted);">Accept Rate</div><div style="font-size:1.5rem;font-weight:700;color:var(--green);">' + acceptRate + '%</div></div>' +
    '<div><div style="font-size:0.75rem;color:var(--muted);">Reject Rate</div><div style="font-size:1.5rem;font-weight:700;color:var(--red);">' + rejectRate + '%</div></div>' +
  '</div>';

  if (stats.bySkill && Object.keys(stats.bySkill).length > 0) {
    html += '<h4 style="margin-bottom:0.5rem;">By Skill</h4><table style="width:100%;border-collapse:collapse;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:0.5rem;color:var(--muted);font-size:0.75rem;">Skill</th><th style="text-align:left;padding:0.5rem;color:var(--muted);font-size:0.75rem;">Accept</th><th style="text-align:left;padding:0.5rem;color:var(--muted);font-size:0.75rem;">Reject</th><th style="text-align:left;padding:0.5rem;color:var(--muted);font-size:0.75rem;">Total</th></tr></thead><tbody>';
    for (const [skill, s] of Object.entries(stats.bySkill)) {
      html += '<tr style="border-bottom:1px solid var(--border);"><td style="padding:0.5rem;">' + escapeHtml(skill) + '</td><td style="padding:0.5rem;color:var(--green);">' + (s.accept || 0) + '</td><td style="padding:0.5rem;color:var(--red);">' + (s.reject || 0) + '</td><td style="padding:0.5rem;">' + (s.total || 0) + '</td></tr>';
    }
    html += '</tbody></table>';
  }
  document.getElementById('feedbackStats').innerHTML = html;
}

// ── Tabs ────────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
  if (name === 'feedback') fetchFeedbackStats();
}

// ── SSE ─────────────────────────────────────────────────────────

function toggleSSE() {
  sseEnabled = !sseEnabled;
  const btn = document.getElementById('sseToggle');
  btn.classList.toggle('active', sseEnabled);
  btn.textContent = sseEnabled ? 'Live' : 'Offline';
  document.getElementById('statusDot').style.background = sseEnabled ? 'var(--green)' : 'var(--muted)';

  if (sseEnabled) { connectSSE(); }
  else { if (sse) { sse.close(); sse = null; } }
}

function connectSSE() {
  if (sse) sse.close();
  sse = new EventSource('/sse');
  sse.onopen = () => { document.getElementById('statusDot').style.background = 'var(--green)'; };
  sse.addEventListener('update', (e) => {
    try {
      const data = JSON.parse(e.data);
      allIssues = data.issues || [];
      updateSummary(data.summary);
      updateSkills(data.skills);
      updateHistory(data.history);
      populateSkillFilter();
      applyFilters();
      updateLastUpdate();
    } catch {}
  });
  sse.onerror = () => {
    document.getElementById('statusDot').style.background = 'var(--red)';
    if (sseEnabled) { setTimeout(connectSSE, 3000); }
  };
}

// ── Toast ───────────────────────────────────────────────────────

function showToast(msg, type) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Refresh ─────────────────────────────────────────────────────

function refreshData() {
  fetchData();
}

// ── Init ────────────────────────────────────────────────────────

fetchData().then(() => {
  populateSkillFilter();
  connectSSE();
});
</script>
</body>
</html>`;
}

// ── Dashboard Server Implementation ────────────────────────────────────────

export function createDashboardServer(options: DashboardServerOptions): DashboardServer {
  const port = options.port ?? 3900;
  const host = options.host ?? 'localhost';
  const enableFixAPI = options.enableFixAPI ?? true;

  let server: http.Server | null = null;
  let currentData: DashboardData = {
    summary: { score: 0, totalIssues: 0, critical: 0, warning: 0, info: 0 },
    issues: [],
    history: [],
    skills: {},
  };

  // SSE client management
  const sseClients = new Map<string, SSEClient>();
  let sseEventId = 0;

  // Fix state tracking
  const fixStates = new Map<string, FixState>();

  // Feedback engine
  const feedbackEngine = new FeedbackLoopEngine();

  function broadcastUpdate(): void {
    void JSON.stringify(currentData);
    for (const [, client] of sseClients) {
      try {
        sendSSE(client, 'update', currentData, ++sseEventId);
      } catch {
        // Client disconnected, will be cleaned up on next check
        sseClients.delete(client.id);
      }
    }
  }

  function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const { pathname, query } = parseUrl(req.url || '/');

    // ── Routes ─────────────────────────────────────────────────

    // Health check
    if (pathname === '/api/health') {
      return jsonResponse(res, {
        status: 'ok',
        uptime: process.uptime(),
        sseClients: sseClients.size,
        issuesCount: currentData.issues.length,
      });
    }

    // Dashboard HTML
    if (pathname === '/' || pathname === '/index.html') {
      return htmlResponse(res, generateDashboardHTML());
    }

    // SSE endpoint
    if (pathname === '/sse') {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sseResponse(res);

      const client: SSEClient = {
        id: clientId,
        res,
        lastEventId: sseEventId,
      };
      sseClients.set(clientId, client);
      logger.debug(`SSE client connected: ${clientId} (total: ${sseClients.size})`);

      // Send initial data
      sendSSE(client, 'update', currentData, ++sseEventId);

      // Heartbeat
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          clearInterval(heartbeat);
          sseClients.delete(clientId);
        }
      }, 30000);

      // Cleanup on close
      res.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(clientId);
        logger.debug(`SSE client disconnected: ${clientId} (total: ${sseClients.size})`);
      });

      return;
    }

    // ── API Routes ────────────────────────────────────────────

    // GET /api/data - full dashboard data
    if (pathname === '/api/data' && req.method === 'GET') {
      return jsonResponse(res, currentData);
    }

    // GET /api/issues - filtered issues
    if (pathname === '/api/issues' && req.method === 'GET') {
      let issues = [...currentData.issues];

      if (query.skill) {
        issues = issues.filter(i => i.skill === query.skill);
      }
      if (query.severity) {
        issues = issues.filter(i => i.severity === query.severity);
      }
      if (query.autoFixable === 'true') {
        issues = issues.filter(i => i.autoFixable === true);
      }

      return jsonResponse(res, {
        total: issues.length,
        issues,
      });
    }

    // GET /api/issue/:id - single issue detail
    if (pathname.startsWith('/api/issue/') && req.method === 'GET') {
      const issueId = pathname.split('/api/issue/')[1];
      const issue = currentData.issues.find(i => i.id === issueId);
      if (!issue) {
        return jsonResponse(res, { error: 'Issue not found' }, 404);
      }
      const fixState = fixStates.get(issueId);
      return jsonResponse(res, {
        ...issue,
        fixState: fixState?.status ?? 'pending',
        fixAppliedAt: fixState?.appliedAt,
      });
    }

    // POST /api/fix/:id - apply fix
    if (pathname.startsWith('/api/fix/') && !pathname.endsWith('/reject') && req.method === 'POST') {
      if (!enableFixAPI) {
        return jsonResponse(res, { error: 'Fix API is disabled' }, 403);
      }
      const issueId = pathname.split('/api/fix/')[1];
      const issue = currentData.issues.find(i => i.id === issueId);
      if (!issue) {
        return jsonResponse(res, { error: 'Issue not found' }, 404);
      }
      if (!issue.autoFixable && !issue.fixSuggestion) {
        return jsonResponse(res, { error: 'Issue is not auto-fixable' }, 400);
      }

      const fixState: FixState = {
        issueId,
        status: 'applied',
        appliedAt: new Date().toISOString(),
        diff: issue.fixSuggestion || 'Fix applied (no diff available)',
      };
      fixStates.set(issueId, fixState);

      // Record feedback
      feedbackEngine.collectFeedback(
        issue.skill,
        issue.id,
        'accept',
        {
          diagnosisId: issueId,
          severity: issue.severity,
          filePath: issue.file,
          notes: 'Applied via dashboard',
        },
      );

      logger.info(`Fix applied for issue ${issueId}`);
      broadcastUpdate();

      return jsonResponse(res, {
        success: true,
        issueId,
        appliedAt: fixState.appliedAt,
        diff: fixState.diff,
      });
    }

    // POST /api/fix/:id/reject - reject fix
    if (pathname.startsWith('/api/fix/') && pathname.endsWith('/reject') && req.method === 'POST') {
      if (!enableFixAPI) {
        return jsonResponse(res, { error: 'Fix API is disabled' }, 403);
      }
      const parts = pathname.split('/api/fix/');
      const issueId = parts[1].replace('/reject', '');
      const issue = currentData.issues.find(i => i.id === issueId);

      const fixState: FixState = {
        issueId,
        status: 'rejected',
        appliedAt: new Date().toISOString(),
      };
      fixStates.set(issueId, fixState);

      // Record feedback
      if (issue) {
        feedbackEngine.collectFeedback(
          issue.skill,
          issue.id,
          'reject',
          {
            diagnosisId: issueId,
            severity: issue.severity,
            filePath: issue.file,
            notes: 'Rejected via dashboard',
          },
        );
      }

      logger.info(`Fix rejected for issue ${issueId}`);
      broadcastUpdate();

      return jsonResponse(res, {
        success: true,
        issueId,
        rejectedAt: fixState.appliedAt,
      });
    }

    // GET /api/feedback - feedback stats
    if (pathname === '/api/feedback' && req.method === 'GET') {
      const stats = feedbackEngine.analyzeFeedback();
      return jsonResponse(res, stats);
    }

    // GET /api/fixes - list fix states
    if (pathname === '/api/fixes' && req.method === 'GET') {
      const states: Record<string, FixState> = {};
      fixStates.forEach((v, k) => { states[k] = v; });
      return jsonResponse(res, states);
    }

    // 404 fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: pathname }));
  }

  return {
    async start() {
      return new Promise((resolve, reject) => {
        server = http.createServer(handleRequest);

        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            logger.error(`Port ${port} is already in use`);
            reject(new Error(`Port ${port} is already in use`));
          } else {
            reject(err);
          }
        });

        server.listen(port, host, () => {
          const actualPort = (server as any).address()?.port ?? port;
          const url = `http://${host}:${actualPort}`;
          logger.info(`Dashboard server started at ${url}`);
          resolve({ port: actualPort, url });
        });
      });
    },

    async stop() {
      return new Promise((resolve) => {
        if (!server) {
          resolve();
          return;
        }

        // Close all SSE connections
        for (const [, client] of sseClients) {
          try {
            client.res.end();
          } catch {
            // Ignore errors on already-closed connections
          }
        }
        sseClients.clear();

        server.close(() => {
          logger.info('Dashboard server stopped');
          server = null;
          resolve();
        });
      });
    },

    getPort() {
      if (!server) return 0;
      return (server.address() as import('net').AddressInfo)?.port ?? 0;
    },

    updateData(data: DashboardData): void {
      currentData = data;

      // Auto-compute summary from issues if not provided
      if (data.issues && data.issues.length > 0) {
        const critical = data.issues.filter(i => i.severity === 'critical').length;
        const warning = data.issues.filter(i => i.severity === 'warning').length;
        const info = data.issues.filter(i => i.severity === 'info').length;

        currentData.summary = {
          score: data.summary?.score ?? calculateScoreFromIssues(data.issues),
          totalIssues: data.issues.length,
          critical,
          warning,
          info,
        };
      }

      logger.debug(`Dashboard data updated: ${data.issues?.length ?? 0} issues, ${Object.keys(data.skills ?? {}).length} skills`);
      broadcastUpdate();
    },
  };
}

// ── Score calculation helper ───────────────────────────────────────────────

function calculateScoreFromIssues(
  issues: Array<{ severity: string }>,
  weights: { critical: number; warning: number; info: number } = {
    critical: 10,
    warning: 3,
    info: 1,
  },
): number {
  const deductions = issues.reduce((sum, issue) => {
    return sum + (weights[issue.severity as keyof typeof weights] || 0);
  }, 0);
  return Math.max(0, 100 - deductions);
}
