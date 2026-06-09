/**
 * 监控面板生成器 — 将评估历史渲染为 HTML 可视化报告
 *
 * 包含：
 * - F1 趋势图（纯 SVG）
 * - 按 skill 分解对比
 * - 按难度分解对比
 * - 历史对比表
 */

import type { EvalHistoryEntry } from './eval-history';

export interface DashboardOptions {
  title?: string;
  entries: EvalHistoryEntry[];
}

/** 生成 HTML 监控面板 */
export function generateDashboard(options: DashboardOptions): string {
  const { entries, title = 'QA-Agent Evaluation Dashboard' } = options;
  const reversed = [...entries].reverse(); // oldest first for charts

  if (reversed.length === 0) {
    return generateEmptyDashboard(title);
  }

  const latest = entries[0];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  :root { --bg: #0f1117; --card: #1a1d27; --border: #2d3140; --text: #e1e4ed; --muted: #8b90a0; --green: #34d399; --red: #f87171; --yellow: #fbbf24; --blue: #60a5fa; --purple: #a78bfa; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; padding: 2rem; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; }
  .card h3 { font-size: 0.875rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
  .metric { font-size: 2.5rem; font-weight: 700; }
  .metric.green { color: var(--green); }
  .metric.red { color: var(--red); }
  .metric.yellow { color: var(--yellow); }
  .trend { font-size: 0.875rem; margin-top: 0.25rem; }
  .trend.improving { color: var(--green); }
  .trend.declining { color: var(--red); }
  .trend.stable { color: var(--muted); }
  .chart { margin: 1.5rem 0; }
  .chart svg { width: 100%; height: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td { font-size: 0.875rem; }
  .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
  .badge.green { background: rgba(52, 211, 153, 0.15); color: var(--green); }
  .badge.red { background: rgba(248, 113, 113, 0.15); color: var(--red); }
  .badge.yellow { background: rgba(251, 191, 36, 0.15); color: var(--yellow); }
  .progress-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 3px; }
  .progress-fill.green { background: var(--green); }
  .progress-fill.red { background: var(--red); }
  .progress-fill.yellow { background: var(--yellow); }
  h2 { font-size: 1.125rem; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
  .skills-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
  .skill-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
  .skill-card h4 { font-size: 1rem; margin-bottom: 0.5rem; }
  .skill-card .f1 { font-size: 1.75rem; font-weight: 700; }
  .mini-chart { margin-top: 0.5rem; }
  .footer { text-align: center; color: var(--muted); font-size: 0.75rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<div class="container">
  <h1>${title}</h1>
  <p class="subtitle">Generated ${new Date().toISOString()} · ${entries.length} evaluation runs</p>

  <!-- Summary Cards -->
  <div class="grid">
    <div class="card">
      <h3>Overall F1</h3>
      <div class="metric ${latest.avgF1 >= 0.8 ? 'green' : latest.avgF1 >= 0.6 ? 'yellow' : 'red'}">${(latest.avgF1 * 100).toFixed(1)}%</div>
      <div class="trend ${getTrendClass(latest.avgF1, entries.length > 1 ? entries[1].avgF1 : latest.avgF1)}">${getTrendArrow(latest.avgF1, entries.length > 1 ? entries[1].avgF1 : latest.avgF1)} ${getTrendText(latest.avgF1, entries.length > 1 ? entries[1].avgF1 : latest.avgF1)}</div>
    </div>
    <div class="card">
      <h3>Pass Rate</h3>
      <div class="metric ${latest.passRate >= 0.8 ? 'green' : latest.passRate >= 0.6 ? 'yellow' : 'red'}">${(latest.passRate * 100).toFixed(1)}%</div>
      <div class="trend ${getTrendClass(latest.passRate, entries.length > 1 ? entries[1].passRate : latest.passRate)}">${getTrendArrow(latest.passRate, entries.length > 1 ? entries[1].passRate : latest.passRate)} ${getTrendText(latest.passRate, entries.length > 1 ? entries[1].passRate : latest.passRate)}</div>
    </div>
    <div class="card">
      <h3>Total Cases</h3>
      <div class="metric">${latest.totalCases}</div>
      <div class="trend stable">${latest.passedCases} passed · ${latest.failedCases} failed</div>
    </div>
  </div>

  <!-- F1 Trend Chart -->
  <div class="card">
    <h3>F1 Score Trend</h3>
    <div class="chart">
      ${generateLineChart(reversed.map(e => ({ value: e.avgF1 * 100, label: formatDate(e.timestamp) })), 'F1 Score (%)', 'var(--blue)')}
    </div>
  </div>

  <!-- Pass Rate Trend Chart -->
  <div class="card">
    <h3>Pass Rate Trend</h3>
    <div class="chart">
      ${generateLineChart(reversed.map(e => ({ value: e.passRate * 100, label: formatDate(e.timestamp) })), 'Pass Rate (%)', 'var(--green)')}
    </div>
  </div>

  <!-- Skill Breakdown -->
  <h2>Skill Breakdown</h2>
  <div class="skills-grid">
    ${generateSkillCards(entries)}
  </div>

  <!-- Skill Comparison Table -->
  <h2>Skill Comparison</h2>
  <div class="card">
    ${generateSkillTable(entries)}
  </div>

  <!-- Difficulty Breakdown -->
  <h2>Difficulty Breakdown</h2>
  <div class="card">
    ${generateDifficultyTable(entries)}
  </div>

  <!-- History Table -->
  <h2>Evaluation History</h2>
  <div class="card">
    ${generateHistoryTable(entries)}
  </div>

  <div class="footer">QA-Agent AI Harness Evaluation Dashboard</div>
</div>
</body>
</html>`;
}

function generateEmptyDashboard(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title>
<style>body{background:#0f1117;color:#e1e4ed;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}h1{color:#8b90a0}</style>
</head><body><div><h1>No Evaluation Data Yet</h1><p style="color:#8b90a0;margin-top:1rem">Run qa-agent eval to generate evaluation data.</p></div></body></html>`;
}

function getTrendClass(current: number, previous: number): string {
  const change = current - previous;
  if (change > 0.02) return 'improving';
  if (change < -0.02) return 'declining';
  return 'stable';
}

function getTrendArrow(current: number, previous: number): string {
  const change = current - previous;
  if (change > 0.02) return '↑';
  if (change < -0.02) return '↓';
  return '→';
}

function getTrendText(current: number, previous: number): string {
  const change = (current - previous) * 100;
  if (Math.abs(change) < 0.1) return 'Stable';
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}pp`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function generateLineChart(
  data: { value: number; label: string }[],
  label: string,
  color: string,
): string {
  if (data.length === 0) return '';

  const width = 800;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minVal = Math.min(...data.map(d => d.value), 0);
  const maxVal = Math.max(...data.map(d => d.value), 100);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = padding.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
    const y = padding.top + chartH - ((d.value - minVal) / range) * chartH;
    return { x, y, value: d.value, label: d.label };
  });

  // Build path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Grid lines
  const gridLines = [0, 25, 50, 75, 100].map(val => {
    const y = padding.top + chartH - ((val - minVal) / range) * chartH;
    if (y >= padding.top && y <= padding.top + chartH) {
      return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#2d3140" stroke-width="1"/>`;
    }
    return '';
  }).join('');

  // Grid labels
  const gridLabels = [0, 25, 50, 75, 100].map(val => {
    const y = padding.top + chartH - ((val - minVal) / range) * chartH;
    if (y >= padding.top && y <= padding.top + chartH) {
      return `<text x="${padding.left - 8}" y="${y + 4}" fill="#8b90a0" font-size="10" text-anchor="end">${val}</text>`;
    }
    return '';
  }).join('');

  // X-axis labels (show max 8)
  const xLabels = points.filter((_, i) => data.length <= 8 || i % Math.ceil(data.length / 8) === 0).map(p =>
    `<text x="${p.x}" y="${height - 8}" fill="#8b90a0" font-size="9" text-anchor="middle">${p.label}</text>`
  ).join('');

  // Dots
  const dots = points.map(p =>
    `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}" stroke="#0f1117" stroke-width="2"/>`
  ).join('');

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${gridLabels}
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${xLabels}
    <text x="${padding.left}" y="12" fill="#8b90a0" font-size="11">${label}</text>
  </svg>`;
}

function generateSkillCards(entries: EvalHistoryEntry[]): string {
  const skills = new Set<string>();
  for (const e of entries) {
    for (const s of Object.keys(e.bySkill)) skills.add(s);
  }

  let html = '';
  for (const skill of [...skills].sort()) {
    const latest = entries[0].bySkill[skill];
    if (!latest) continue;

    const f1Pct = (latest.f1 * 100).toFixed(1);
    const trend = entries.length > 1 ? getTrendArrow(latest.f1, entries[1].bySkill[skill]?.f1 ?? latest.f1) : '';
    const colorClass = latest.f1 >= 0.8 ? 'green' : latest.f1 >= 0.6 ? 'yellow' : 'red';

    // Mini trend
    const miniValues = [...entries].reverse().map(e => e.bySkill[skill]?.f1 ?? 0);
    const miniChart = generateMiniSparkline(miniValues);

    html += `<div class="skill-card">
      <h4>${skill}</h4>
      <div class="f1 ${colorClass}">${f1Pct}%</div>
      <div class="trend ${latest.f1 >= 0.8 ? 'improving' : latest.f1 >= 0.6 ? '' : 'declining'}">${trend} ${latest.cases} cases · ${latest.passed} passed</div>
      <div class="mini-chart">${miniChart}</div>
    </div>`;
  }

  return html;
}

function generateMiniSparkline(values: number[]): string {
  if (values.length < 2) return '';

  const width = 120;
  const height = 30;
  const padding = 2;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 0.01;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((v - minVal) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const color = values[values.length - 1] >= 0.8 ? '#34d399' : values[values.length - 1] >= 0.6 ? '#fbbf24' : '#f87171';

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5"/>
  </svg>`;
}

function generateSkillTable(entries: EvalHistoryEntry[]): string {
  const skills = new Set<string>();
  for (const e of entries) {
    for (const s of Object.keys(e.bySkill)) skills.add(s);
  }

  let rows = '';
  for (const skill of [...skills].sort()) {
    const latest = entries[0].bySkill[skill];
    if (!latest) continue;

    const f1Pct = (latest.f1 * 100).toFixed(1);
    const passPct = latest.cases > 0 ? ((latest.passed / latest.cases) * 100).toFixed(0) : '0';
    const colorClass = latest.f1 >= 0.8 ? 'green' : latest.f1 >= 0.6 ? 'yellow' : 'red';

    rows += `<tr>
      <td><strong>${skill}</strong></td>
      <td>${latest.cases}</td>
      <td><span class="badge ${colorClass}">${f1Pct}%</span></td>
      <td><div class="progress-bar"><div class="progress-fill ${colorClass}" style="width:${passPct}%"></div></div></td>
      <td>${latest.passed}/${latest.cases}</td>
    </tr>`;
  }

  return `<table>
    <thead><tr><th>Skill</th><th>Cases</th><th>F1</th><th>Pass Rate</th><th>Passed</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function generateDifficultyTable(entries: EvalHistoryEntry[]): string {
  const difficulties = new Set<string>();
  for (const e of entries) {
    for (const d of Object.keys(e.byDifficulty)) difficulties.add(d);
  }

  const order = ['easy', 'medium', 'hard'];
  let rows = '';
  for (const diff of order) {
    if (!difficulties.has(diff)) continue;
    const latest = entries[0].byDifficulty[diff];
    if (!latest) continue;

    const f1Pct = (latest.f1 * 100).toFixed(1);
    const passPct = latest.cases > 0 ? ((latest.passed / latest.cases) * 100).toFixed(0) : '0';
    const colorClass = latest.f1 >= 0.8 ? 'green' : latest.f1 >= 0.6 ? 'yellow' : 'red';

    rows += `<tr>
      <td><strong>${diff}</strong></td>
      <td>${latest.cases}</td>
      <td><span class="badge ${colorClass}">${f1Pct}%</span></td>
      <td><div class="progress-bar"><div class="progress-fill ${colorClass}" style="width:${passPct}%"></div></div></td>
      <td>${latest.passed}/${latest.cases}</td>
    </tr>`;
  }

  return `<table>
    <thead><tr><th>Difficulty</th><th>Cases</th><th>F1</th><th>Pass Rate</th><th>Passed</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function generateHistoryTable(entries: EvalHistoryEntry[]): string {
  let rows = '';
  for (const entry of entries.slice(0, 20)) {
    const f1Pct = (entry.avgF1 * 100).toFixed(1);
    const passPct = (entry.passRate * 100).toFixed(1);
    const gateClass = entry.qualityGatePassed ? 'green' : 'red';
    const gateText = entry.qualityGatePassed ? 'PASSED' : 'FAILED';
    const date = new Date(entry.timestamp).toLocaleString();

    rows += `<tr>
      <td>${date}</td>
      <td><span class="badge ${entry.avgF1 >= 0.8 ? 'green' : entry.avgF1 >= 0.6 ? 'yellow' : 'red'}">${f1Pct}%</span></td>
      <td>${passPct}%</td>
      <td>${entry.totalCases}</td>
      <td><span class="badge ${gateClass}">${gateText}</span></td>
    </tr>`;
  }

  return `<table>
    <thead><tr><th>Date</th><th>F1</th><th>Pass Rate</th><th>Cases</th><th>Gate</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
