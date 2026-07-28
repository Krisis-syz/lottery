// ============ 全局状态 ============
let allSources = [];
let allRecords = [];
let allReports = [];
let currentMonth = getCurrentYearMonth();
let trendChart = null;
let pieChart = null;
let prevPieChart = null;
let overviewMode = 'total';
let activeReportMonth = null;
let tableShowCount = 12;

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  if (!(await requireAuth())) return;
  await loadAllData();
  renderFillTab();
  renderOverviewTab();
  renderReportTab();

  // 当月已填写则默认切到总览
  const hasFilled = allSources.some(s => getAmountForMonth(s.id, currentMonth) > 0);
  if (hasFilled) switchTab('overview');
});

async function loadAllData() {
  try {
    allSources = await fundApi.getSources();
    allRecords = await fundApi.getAllRecords();
    allReports = await fundApi.getReports();
  } catch (e) {
    console.error('加载数据失败:', e);
  }
}

// ============ Tab 切换 ============
function switchTab(tab) {
  document.querySelectorAll('.fund-tab').forEach((t, i) => {
    const tabs = ['fill', 'overview', 'report'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab' + cap(tab)).classList.add('active');
  document.getElementById('fabBtn').style.display = tab === 'fill' ? 'flex' : 'none';

  if (tab === 'overview') {
    setTimeout(() => { renderTrendChart(); renderPieChart(); }, 50);
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ============ Tab 1: 填写资金 ============
function renderFillTab() {
  const container = document.getElementById('fillCards');
  const saveBtn = document.getElementById('saveFillBtn');

  if (allSources.length === 0) {
    container.innerHTML = `<div class="empty-hint"><div class="empty-hint-icon">💰</div><div>还没有资金来源</div><div style="margin-top:6px;font-size:0.8rem;">点击右下角 + 添加</div></div>`;
    saveBtn.style.display = 'none';
    return;
  }

  saveBtn.style.display = 'flex';
  container.innerHTML = allSources.map((s, i) => {
    const color = COLORS[i % COLORS.length];
    const existing = getAmountForMonth(s.id, currentMonth);
    const hasRecord = existing > 0;
    return `
      <div class="fund-card" style="border-left:none;">
        <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${color};border-radius:4px 0 0 4px;"></div>
        <div class="fund-card-top">
          <div class="fund-card-name"><span class="fund-card-dot" style="background:${color}"></span>${s.name}</div>
          <div class="fund-card-actions"><button class="fund-card-btn danger" onclick="deleteFundSource('${s.id}','${s.name}')" title="删除">✕</button></div>
        </div>
        <div class="fund-card-input-row">
          <span class="fund-card-currency">¥</span>
          <input type="number" class="fund-card-input" data-source-id="${s.id}" placeholder="0.00" value="${hasRecord ? existing : ''}" step="0.01" min="0">
        </div>
        ${!hasRecord ? '<div class="fund-card-hint">本月尚未填写</div>' : ''}
      </div>`;
  }).join('');
}

async function saveFillRecords() {
  const inputs = document.querySelectorAll('#fillCards .fund-card-input');
  const records = [];
  inputs.forEach(input => {
    records.push({ sourceId: input.dataset.sourceId, amount: parseFloat(input.value) || 0 });
  });
  if (records.length === 0) return;
  try {
    await fundApi.saveRecords(currentMonth, records);
    allRecords = await fundApi.getAllRecords();
    renderFillTab();
    showToast('保存成功');
  } catch (e) { alert('保存失败: ' + e.message); }
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'save-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

// ============ 新增/删除资金 ============
function showAddModal() {
  document.getElementById('addModal').classList.add('show');
  const inp = document.getElementById('addModalInput');
  inp.value = '';
  setTimeout(() => inp.focus(), 100);
}

function hideAddModal() { document.getElementById('addModal').classList.remove('show'); }

document.getElementById('addModal').addEventListener('click', e => { if (e.target === e.currentTarget) hideAddModal(); });
document.getElementById('addModalInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddSource(); });

async function confirmAddSource() {
  const inp = document.getElementById('addModalInput');
  const name = inp.value.trim();
  if (!name) return;
  try {
    await fundApi.addSource(name);
    allSources = await fundApi.getSources();
    hideAddModal();
    renderFillTab();
  } catch (e) { alert('添加失败: ' + e.message); }
}

async function deleteFundSource(id, name) {
  if (!confirm(`确定删除「${name}」？相关记录也会被删除。`)) return;
  try {
    await fundApi.deleteSource(id);
    allSources = await fundApi.getSources();
    allRecords = await fundApi.getAllRecords();
    renderFillTab();
    renderOverviewTab();
  } catch (e) { alert('删除失败: ' + e.message); }
}

// ============ Tab 2: 资金总览 ============
function renderOverviewTab() {
  updateOverviewCard();
  renderTrendChart();
  renderPieChart();
  renderOverviewTable();
  updateOverviewVisibility();
}

function updateOverviewVisibility() {
  const pieCard = document.getElementById('pieCard');
  const prevPieCard = document.getElementById('prevPieCard');
  const tableCard = document.getElementById('tableCard');
  const tableTitle = document.getElementById('tableTitle');
  const tableHead = document.getElementById('tableHead');
  const trendToggle = document.getElementById('trendToggle');
  const trendCard = document.getElementById('trendCard');

  if (overviewMode === 'type') {
    if (pieCard) pieCard.style.display = 'none';
    if (prevPieCard) prevPieCard.style.display = 'none';
    if (tableCard) tableCard.style.display = 'block';
    if (tableTitle) tableTitle.textContent = '月度明细';
    if (tableHead) tableHead.innerHTML = '<tr><th>月份</th><th>金额</th><th>占比</th><th>环比</th></tr>';
    if (trendToggle) trendToggle.style.display = 'flex';
    if (trendCard) trendCard.style.display = 'block';
  } else if (overviewMode === 'month') {
    if (pieCard) pieCard.style.display = 'block';
    if (prevPieCard) prevPieCard.style.display = 'none';
    if (tableCard) tableCard.style.display = 'none';
    if (trendToggle) trendToggle.style.display = 'none';
    if (trendCard) trendCard.style.display = 'none';
  } else {
    if (pieCard) pieCard.style.display = 'block';
    if (prevPieCard) prevPieCard.style.display = 'none';
    if (tableCard) tableCard.style.display = 'block';
    if (tableTitle) tableTitle.textContent = '月度明细';
    if (tableHead) tableHead.innerHTML = '<tr><th>月份</th><th>总额</th><th>收支</th><th>环比</th><th>同比</th></tr>';
    if (trendToggle) trendToggle.style.display = 'none';
    if (trendCard) trendCard.style.display = 'block';
  }
}

let trendActiveDataset = 0; // 0=金额, 1=占比

function toggleTrendDataset(idx) {
  trendActiveDataset = idx;
  document.querySelectorAll('#trendToggle .chart-tab').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  if (trendChart && trendChart.data.datasets.length === 2) {
    trendChart.data.datasets[0].hidden = idx !== 0;
    trendChart.data.datasets[1].hidden = idx !== 1;
    trendChart.options.scales.y.display = idx === 0;
    trendChart.options.scales.y1.display = idx === 1;
    trendChart.update();
  }
}

function setOverviewMode(mode) {
  overviewMode = mode;
  tableShowCount = 12;
  document.querySelectorAll('.filter-bar .filter-btn').forEach(btn => {
    const text = btn.textContent;
    btn.classList.toggle('active',
      (mode === 'total' && text.includes('总资金')) ||
      (mode === 'type' && text.includes('类型')) ||
      (mode === 'month' && text.includes('月份'))
    );
  });

  const select = document.getElementById('filterSelect');
  if (mode === 'type') {
    select.style.display = 'block';
    select.innerHTML = allSources.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  } else if (mode === 'month') {
    select.style.display = 'block';
    select.innerHTML = getAvailableMonths().map(m => `<option value="${m}">${m}</option>`).join('');
  } else {
    select.style.display = 'none';
  }

  renderOverviewTab();
}

function onFilterSelect() {
  tableShowCount = 12;
  renderOverviewTab();
}

function updateOverviewCard() {
  const amountEl = document.getElementById('overviewAmount');
  const changeEl = document.getElementById('overviewChange');
  const labelEl = document.querySelector('.overview-label');

  let total = 0, prev = 0, label = '总资产';

  if (overviewMode === 'total') {
    total = getMonthTotal(currentMonth);
    prev = getMonthTotal(getPrevMonth(currentMonth));
    label = '总资产';
  } else if (overviewMode === 'type') {
    const sid = document.getElementById('filterSelect')?.value;
    const src = allSources.find(s => s.id === sid);
    if (!src) { amountEl.textContent = '--'; return; }
    total = getAmountForMonth(sid, currentMonth);
    prev = getAmountForMonth(sid, getPrevMonth(currentMonth));
    label = src.name + ' 资产';
  } else {
    const month = document.getElementById('filterSelect')?.value || currentMonth;
    total = getMonthTotal(month);
    prev = getMonthTotal(getPrevMonth(month));
    label = month + ' 总资产';
  }

  amountEl.textContent = '¥' + fmtNum(total);
  labelEl.textContent = label;

  const diff = total - prev;
  if (prev > 0 || total > 0) {
    const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : '0.0';
    changeEl.textContent = `较上月 ${diff >= 0 ? '+' : ''}${fmtNum(diff)} (${diff >= 0 ? '+' : ''}${pct}%)`;
    changeEl.className = 'overview-sub ' + (diff >= 0 ? 'up' : 'down');
  } else {
    changeEl.textContent = '暂无数据';
    changeEl.className = 'overview-sub';
  }
}

// ============ 趋势图 ============
function renderTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  if (trendChart) trendChart.destroy();

  if (overviewMode === 'type') {
    renderTypeTrendChart(ctx);
    return;
  }

  let data = [];
  if (overviewMode === 'total') {
    const totals = getMonthlyTotals();
    data = Object.entries(totals).map(([m, t]) => ({ month: m, value: t }));
  } else {
    const totals = getMonthlyTotals();
    data = Object.entries(totals).map(([m, t]) => ({ month: m, value: t }));
  }

  data.sort((a, b) => a.month.localeCompare(b.month));

  trendChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: data.map(d => d.month),
      datasets: [{
        data: data.map(d => d.value),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 5, color: '#6b7280', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: v => '¥' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : v) } }
      }
    }
  });
}

function renderTypeTrendChart(ctx) {
  const sourceId = document.getElementById('filterSelect')?.value;
  if (!sourceId) return;

  const map = {};
  allRecords.filter(r => r.sourceId === sourceId).forEach(r => {
    map[r.yearMonth] = r.amount;
  });

  let data = Object.entries(map).map(([m, v]) => ({ month: m, value: v }));
  data.sort((a, b) => a.month.localeCompare(b.month));

  const totals = getMonthlyTotals();
  data = data.map(d => ({
    ...d,
    pct: totals[d.month] > 0 ? (d.value / totals[d.month] * 100) : 0
  }));

  trendChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: data.map(d => d.month),
      datasets: [
        {
          label: '金额',
          data: data.map(d => d.value),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2,
          yAxisID: 'y',
          hidden: trendActiveDataset !== 0
        },
        {
          label: '占比',
          data: data.map(d => d.pct),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2,
          borderDash: [5, 5],
          yAxisID: 'y1',
          hidden: trendActiveDataset !== 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 5, color: '#6b7280', font: { size: 10 } } },
        y: { type: 'linear', position: 'left', display: trendActiveDataset === 0, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#f59e0b', font: { size: 10 }, callback: v => '¥' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : v) } },
        y1: { type: 'linear', position: 'left', display: trendActiveDataset === 1, grid: { drawOnChartArea: false }, ticks: { color: '#3b82f6', font: { size: 10 }, callback: v => v.toFixed(0) + '%' }, min: 0, max: 100 }
      }
    }
  });
  trendChart.update();
}

// ============ 饼图 ============
function renderPieChart() {
  if (overviewMode === 'month') {
    renderMonthPieCharts();
    return;
  }

  const ctx = document.getElementById('pieChart');
  if (!ctx) return;
  if (pieChart) pieChart.destroy();

  let month = currentMonth;
  document.getElementById('pieTitle').textContent = '资金占比';

  const items = allSources.map((s, i) => ({
    name: s.name,
    amount: getAmountForMonth(s.id, month),
    color: COLORS[i % COLORS.length]
  })).filter(s => s.amount > 0);

  if (items.length === 0) {
    document.getElementById('pieLegend').innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">暂无数据</div>';
    return;
  }

  pieChart = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: items.map(s => s.name),
      datasets: [{ data: items.map(s => s.amount), backgroundColor: items.map(s => s.color), borderWidth: 0, hoverOffset: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: true, cutout: '62%', plugins: { legend: { display: false } } }
  });

  const total = items.reduce((s, i) => s + i.amount, 0);
  document.getElementById('pieLegend').innerHTML = items.map(s => {
    const pct = total > 0 ? ((s.amount / total) * 100).toFixed(1) : '0';
    return `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span><span class="legend-name">${s.name}</span><span class="legend-val">¥${fmtNum(s.amount)} (${pct}%)</span></div>`;
  }).join('');
}

function renderMonthPieCharts() {
  const selMonth = document.getElementById('filterSelect')?.value || currentMonth;
  document.getElementById('pieTitle').textContent = selMonth.replace('-', '年') + '月 资金占比';
  renderSinglePie('pieChart', 'pieLegend', selMonth);
}

function renderSinglePie(canvasId, legendId, month) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (canvasId === 'pieChart' && pieChart) pieChart.destroy();
  if (canvasId === 'prevPieChart' && prevPieChart) prevPieChart.destroy();

  const items = allSources.map((s, i) => ({
    name: s.name,
    amount: getAmountForMonth(s.id, month),
    color: COLORS[i % COLORS.length]
  })).filter(s => s.amount > 0);

  const legendEl = document.getElementById(legendId);
  if (items.length === 0) {
    legendEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">暂无数据</div>';
    return;
  }

  const chart = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: items.map(s => s.name),
      datasets: [{ data: items.map(s => s.amount), backgroundColor: items.map(s => s.color), borderWidth: 0, hoverOffset: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: true, cutout: '62%', plugins: { legend: { display: false } } }
  });

  if (canvasId === 'pieChart') pieChart = chart;
  else prevPieChart = chart;

  const total = items.reduce((s, i) => s + i.amount, 0);
  legendEl.innerHTML = items.map(s => {
    const pct = total > 0 ? ((s.amount / total) * 100).toFixed(1) : '0';
    return `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span><span class="legend-name">${s.name}</span><span class="legend-val">¥${fmtNum(s.amount)} (${pct}%)</span></div>`;
  }).join('');
}

// ============ 月度明细表 ============
function renderOverviewTable() {
  const tbody = document.getElementById('overviewTable');
  const showMoreBtn = document.getElementById('showMoreBtn');

  if (overviewMode === 'type') {
    renderTypeDetailTable(tbody);
    return;
  }

  const totals = getMonthlyTotals();
  let data = Object.entries(totals).map(([m, t]) => ({ month: m, total: t })).sort((a, b) => b.month.localeCompare(a.month));

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">暂无记录</td></tr>';
    if (showMoreBtn) showMoreBtn.style.display = 'none';
    return;
  }

  const visible = data.slice(0, tableShowCount);
  const hasMore = data.length > tableShowCount;

  tbody.innerHTML = visible.map((d, i) => {
    const fullIdx = data.indexOf(d);
    const prev = data[fullIdx + 1];
    const lastYear = data.find(x => x.month === d.month.replace(/\d{4}/, m => String(Number(m) - 1)));

    let change = '-', mom = '-', yoy = '-';
    let changeColor = '', momColor = '', yoyColor = '';
    if (prev) {
      const diff = d.total - prev.total;
      change = `${diff >= 0 ? '+' : '-'}¥${fmtNum(Math.abs(diff))}`;
      changeColor = diff >= 0 ? 'var(--success)' : 'var(--danger)';
      if (prev.total > 0) {
        const momVal = (diff / prev.total * 100);
        mom = `${momVal >= 0 ? '+' : ''}${momVal.toFixed(1)}%`;
        momColor = momVal >= 0 ? 'var(--success)' : 'var(--danger)';
      }
    }
    if (lastYear && lastYear.total > 0) {
      const yoyVal = ((d.total - lastYear.total) / lastYear.total * 100);
      yoy = `${yoyVal >= 0 ? '+' : ''}${yoyVal.toFixed(1)}%`;
      yoyColor = yoyVal >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    return `<tr>
      <td>${d.month}</td>
      <td class="mono">¥${fmtNum(d.total)}</td>
      <td class="mono" style="color:${changeColor}">${change}</td>
      <td class="mono" style="color:${momColor}">${mom}</td>
      <td class="mono" style="color:${yoyColor}">${yoy}</td>
    </tr>`;
  }).join('');

  if (showMoreBtn) {
    showMoreBtn.style.display = hasMore ? 'flex' : 'none';
  }
}

function loadMoreRecords() {
  tableShowCount += 12;
  renderOverviewTable();
}

// ============ 按类型 明细表 ============
function renderTypeDetailTable(tbody) {
  const sourceId = document.getElementById('filterSelect')?.value;
  if (!sourceId) return;

  const map = {};
  allRecords.filter(r => r.sourceId === sourceId).forEach(r => {
    map[r.yearMonth] = r.amount;
  });

  const totals = getMonthlyTotals();
  let data = Object.entries(map)
    .map(([m, v]) => ({
      month: m,
      amount: v,
      pct: totals[m] > 0 ? (v / totals[m] * 100) : 0
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">暂无记录</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((d, i) => {
    const prev = data[i + 1];
    let mom = '-', momColor = '';
    if (prev && prev.amount > 0) {
      const momVal = (d.amount - prev.amount) / prev.amount * 100;
      mom = `${momVal >= 0 ? '+' : ''}${momVal.toFixed(1)}%`;
      momColor = momVal >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    return `<tr>
      <td>${d.month}</td>
      <td class="mono">¥${fmtNum(d.amount)}</td>
      <td class="mono" style="color:var(--gold);">${d.pct.toFixed(1)}%</td>
      <td class="mono" style="color:${momColor}">${mom}</td>
    </tr>`;
  }).join('');
}

// ============ Tab 3: AI 报告 ============
function renderReportTab() {
  renderCurrentReport();
  renderHistoryList();
}

function renderCurrentReport(month) {
  const targetMonth = month || getPrevMonth(currentMonth);
  activeReportMonth = targetMonth;
  const container = document.getElementById('reportCurrent');
  const displayMonth = targetMonth.replace('-', '年') + '月';

  const report = allReports.find(r => r.year_month === targetMonth);
  if (report) {
    container.innerHTML = `<div class="report-month-label">${displayMonth} 资金报告</div><div class="report-body">${escapeHtml(report.report_text)}</div>`;
  } else {
    const hasRecords = allRecords.some(r => r.yearMonth === targetMonth);
    if (!hasRecords) {
      container.innerHTML = `<div class="report-empty"><div class="report-empty-icon">📝</div><div class="report-empty-text">${displayMonth} 暂无资金记录</div><div style="margin-top:4px;font-size:0.8rem;color:var(--text-muted);">请先在"填写资金"中记录该月数据</div></div>`;
    } else {
      container.innerHTML = `<div class="report-month-label">${displayMonth} 资金报告</div><button class="btn-generate" onclick="generateReport('${targetMonth}')">一键生成 ${displayMonth} 报告</button>`;
    }
  }
}

function renderHistoryList() {
  const list = document.getElementById('historyList');
  if (allReports.length === 0) {
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem;">暂无历史报告</div>';
    return;
  }
  list.innerHTML = allReports.map(r => {
    const display = r.year_month.replace('-', '年') + '月';
    return `<div class="history-item ${r.year_month === activeReportMonth ? 'active' : ''}" onclick="selectHistoryReport('${r.year_month}')">${display}报告</div>`;
  }).join('');
}

function toggleHistory() {
  document.getElementById('historyList').classList.toggle('show');
  document.getElementById('historyArrow').classList.toggle('open');
}

function selectHistoryReport(month) {
  document.getElementById('historyList').classList.remove('show');
  document.getElementById('historyArrow').classList.remove('open');
  renderCurrentReport(month);
}

async function generateReport(month) {
  const container = document.getElementById('reportCurrent');
  const displayMonth = month.replace('-', '年') + '月';
  container.innerHTML = `<div class="report-loading"><div class="spinner"></div><div style="color:var(--text-secondary);">正在生成 ${displayMonth} 资金报告...</div></div>`;

  try {
    const result = await fundApi.generateReport(month);
    if (result && result.report) {
      allReports = await fundApi.getReports();
      container.innerHTML = `<div class="report-month-label">${displayMonth} 资金报告</div><div class="report-body">${escapeHtml(result.report)}</div>`;
      renderHistoryList();
    } else {
      container.innerHTML = `<div style="text-align:center;padding:20px;"><div style="color:var(--text-muted);margin-bottom:12px;">生成失败，请稍后重试</div><button class="btn-generate" onclick="generateReport('${month}')">重试</button></div>`;
    }
  } catch (e) {
    console.error('生成报告失败:', e);
    container.innerHTML = `<div style="text-align:center;padding:20px;"><div style="color:var(--text-muted);margin-bottom:12px;">${e.message || '生成失败'}</div><button class="btn-generate" onclick="generateReport('${month}')">重试</button></div>`;
  }
}

// ============ 工具函数 ============
function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPrevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function getMonthTotal(ym) {
  let total = 0;
  allSources.forEach(s => { total += getAmountForMonth(s.id, ym); });
  return total;
}

function getAmountForMonth(sourceId, ym) {
  const records = allRecords.filter(r => r.sourceId === sourceId && r.yearMonth === ym);
  return records.length > 0 ? records[records.length - 1].amount : 0;
}

function getMonthlyTotals() {
  const totals = {};
  allRecords.forEach(r => { totals[r.yearMonth] = (totals[r.yearMonth] || 0) + r.amount; });
  return totals;
}

function getAvailableMonths() {
  const months = new Set();
  allRecords.forEach(r => months.add(r.yearMonth));
  months.add(currentMonth);
  months.add(getPrevMonth(currentMonth));
  return [...months].sort().reverse();
}

function fmtNum(n) {
  return Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
