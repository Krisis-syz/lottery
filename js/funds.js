// ============ 全局状态 ============
let allSources = [];
let allRecords = [];
let allReports = [];
let currentMonth = getCurrentYearMonth();
let trendChart = null;
let pieChart = null;

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  if (!(await requireAuth())) return;
  await loadAllData();
  renderRecordForm();
  renderSourceList();
  renderSummary();
  renderTrendChart();
  renderPieChart();
  renderDetailTable();
  renderReportMonthSelect();
  loadReport();
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

// ============ 总资产卡片 ============
function renderSummary() {
  const total = getMonthTotal(currentMonth);
  const prevMonth = getPrevMonth(currentMonth);
  const prevTotal = getMonthTotal(prevMonth);
  const change = total - prevTotal;

  document.getElementById('totalAmount').textContent = '¥' + formatFundNumber(total);

  const changeEl = document.getElementById('monthChange');
  if (prevTotal > 0 || total > 0) {
    const prefix = change >= 0 ? '+' : '';
    const pct = prevTotal > 0 ? ((change / prevTotal) * 100).toFixed(1) : '0.0';
    changeEl.textContent = `本月 ${prefix}${formatFundNumber(change)} (${prefix}${pct}%)`;
    changeEl.className = 'fund-change ' + (change >= 0 ? 'positive' : 'negative');
  } else {
    changeEl.textContent = '暂无数据';
    changeEl.className = 'fund-change';
  }

  // 来源小标签
  const chipsEl = document.getElementById('sourcesChips');
  chipsEl.innerHTML = allSources.map((s, i) => {
    const amt = getLatestAmount(s.id);
    return `<div class="fund-source-chip">
      <span class="fund-source-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
      <span class="name">${s.name}</span>
      <span class="amount">¥${formatFundNumber(amt)}</span>
    </div>`;
  }).join('');
}

// ============ 趋势图 ============
let trendView = 'year';

function switchTrendView(view) {
  trendView = view;
  document.querySelectorAll('.section-card:nth-child(2) .chart-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === (view === 'year' ? '近一年' : '全部'));
  });
  renderTrendChart();
}

function renderTrendChart() {
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  const monthTotals = getMonthlyTotals();
  let data = Object.entries(monthTotals)
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (trendView === 'year') {
    const cutoff = getPrevMonth(getCurrentYearMonth());
    const cutoff12 = getPrevMonth(cutoff); // 12 months back
    data = data.filter(d => d.month >= cutoff12);
  }

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.month),
      datasets: [{
        data: data.map(d => d.total),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { maxTicksLimit: 6, color: '#9ca3af', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 11 },
            callback: v => '¥' + (v / 1000).toFixed(1) + 'k'
          }
        }
      }
    }
  });
}

// ============ 饼图 ============
function updatePieChart() {
  renderPieChart();
}

function renderPieChart() {
  const month = document.getElementById('pieMonthSelect').value || currentMonth;

  // 填充月份选项
  populatePieMonthSelect(month);

  const ctx = document.getElementById('pieChart').getContext('2d');
  if (pieChart) pieChart.destroy();

  const sourceAmounts = allSources.map(s => ({
    name: s.name,
    amount: getAmountForMonth(s.id, month)
  })).filter(s => s.amount > 0);

  if (sourceAmounts.length === 0) {
    document.getElementById('pieLegend').innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">暂无数据</div>';
    return;
  }

  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sourceAmounts.map(s => s.name),
      datasets: [{
        data: sourceAmounts.map(s => s.amount),
        backgroundColor: sourceAmounts.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '60%',
      plugins: { legend: { display: false } }
    }
  });

  const total = sourceAmounts.reduce((sum, s) => sum + s.amount, 0);
  document.getElementById('pieLegend').innerHTML = sourceAmounts.map((s, i) => {
    const pct = total > 0 ? ((s.amount / total) * 100).toFixed(1) : '0';
    return `<div class="pie-legend-item">
      <span class="pie-legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
      <span class="pie-legend-label">${s.name}</span>
      <span class="pie-legend-value">¥${formatFundNumber(s.amount)} (${pct}%)</span>
    </div>`;
  }).join('');
}

function populatePieMonthSelect(selected) {
  const sel = document.getElementById('pieMonthSelect');
  const months = getAvailableMonths();
  if (sel.options.length > 0 && sel.dataset.loaded === 'true') {
    sel.value = selected;
    return;
  }
  sel.innerHTML = months.map(m =>
    `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`
  ).join('');
  sel.dataset.loaded = 'true';
}

// ============ 详细记录表 ============
let recordView = 'year';

function switchRecordView(view) {
  recordView = view;
  document.querySelectorAll('.section-card:nth-child(4) .chart-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === (view === 'year' ? '近一年' : '全部'));
  });
  renderDetailTable();
}

function renderDetailTable() {
  const tbody = document.getElementById('detailTableBody');
  const emptyEl = document.getElementById('emptyDetail');

  const monthTotals = getMonthlyTotals();
  let data = Object.entries(monthTotals)
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => b.month.localeCompare(a.month)); // desc

  if (recordView === 'year') {
    const cutoff = getPrevMonth(getCurrentYearMonth());
    const cutoff12 = getPrevMonth(cutoff);
    data = data.filter(d => d.month >= cutoff12);
  }

  if (data.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  tbody.innerHTML = data.map((d, i) => {
    const prev = data[i + 1]; // 下一条（上个月）
    const lastYear = data.find(x => x.month === d.month.replace(/\d{4}/, m => String(Number(m) - 1)));

    // 环比
    let momText = '-';
    if (prev && prev.total > 0) {
      const mom = ((d.total - prev.total) / prev.total * 100).toFixed(1);
      momText = `${mom >= 0 ? '+' : ''}${mom}%`;
    }

    // 同比
    let yoyText = '-';
    if (lastYear && lastYear.total > 0) {
      const yoy = ((d.total - lastYear.total) / lastYear.total * 100).toFixed(1);
      yoyText = `${yoy >= 0 ? '+' : ''}${yoy}%`;
    }

    // 收支
    let changeText = '-';
    if (prev) {
      const change = d.total - prev.total;
      changeText = `${change >= 0 ? '+' : ''}¥${formatFundNumber(change)}`;
    }

    return `<tr>
      <td>${d.month}</td>
      <td class="mono">¥${formatFundNumber(d.total)}</td>
      <td class="mono" style="color:${(d.total - (prev?.total || 0)) >= 0 ? 'var(--success)' : 'var(--danger)'}">${changeText}</td>
      <td class="mono">${momText}</td>
      <td class="mono">${yoyText}</td>
    </tr>`;
  }).join('');
}

// ============ 资金来源管理 ============
function renderSourceList() {
  const container = document.getElementById('sourceList');
  if (allSources.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">暂无资金来源，请添加</div>';
    return;
  }

  container.innerHTML = allSources.map((s, i) => {
    const amt = getLatestAmount(s.id);
    return `<div class="source-item">
      <div class="source-info">
        <span class="source-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
        <span class="source-name">${s.name}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:var(--text-secondary);">¥${formatFundNumber(amt)}</span>
      </div>
      <div class="source-actions">
        <button class="source-btn danger" onclick="deleteFundSource('${s.id}', '${s.name}')">删除</button>
      </div>
    </div>`;
  }).join('');
}

async function addNewSource() {
  const input = document.getElementById('newSourceName');
  const name = input.value.trim();
  if (!name) return;

  try {
    await fundApi.addSource(name);
    input.value = '';
    allSources = await fundApi.getSources();
    renderSourceList();
    renderRecordForm();
    renderSummary();
    renderPieChart();
  } catch (e) {
    alert('添加失败: ' + e.message);
  }
}

async function deleteFundSource(id, name) {
  if (!confirm(`确定要删除「${name}」吗？相关记录也会被删除。`)) return;
  try {
    await fundApi.deleteSource(id);
    allSources = await fundApi.getSources();
    allRecords = await fundApi.getAllRecords();
    renderSourceList();
    renderRecordForm();
    renderSummary();
    renderTrendChart();
    renderPieChart();
    renderDetailTable();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

// Enter 键添加
document.getElementById('newSourceName')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addNewSource();
});

// ============ 本月记录表单 ============
function renderRecordForm() {
  const container = document.getElementById('recordForm');
  const titleEl = document.getElementById('recordTitle');
  const saveBtn = document.getElementById('saveBtn');

  titleEl.textContent = `${currentMonth.replace('-', '年')}月 记录`;

  if (allSources.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px;"><p>请先添加资金来源</p></div>';
    saveBtn.style.display = 'none';
    return;
  }

  saveBtn.style.display = 'block';

  container.innerHTML = allSources.map(s => {
    const existing = getAmountForMonth(s.id, currentMonth);
    return `<div class="record-row">
      <span class="record-label">${s.name}</span>
      <input type="number" class="record-input" data-source-id="${s.id}"
        placeholder="输入金额" value="${existing > 0 ? existing : ''}" step="0.01" min="0">
    </div>`;
  }).join('');
}

async function saveMonthlyRecords() {
  const inputs = document.querySelectorAll('#recordForm .record-input');
  const records = [];

  inputs.forEach(input => {
    const sourceId = input.dataset.sourceId;
    const amount = parseFloat(input.value) || 0;
    records.push({ sourceId, amount });
  });

  if (records.length === 0) return;

  try {
    await fundApi.saveRecords(currentMonth, records);
    allRecords = await fundApi.getAllRecords();
    renderSummary();
    renderTrendChart();
    renderPieChart();
    renderDetailTable();
    alert('保存成功');
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

// ============ 月度报告 ============
function renderReportMonthSelect() {
  const sel = document.getElementById('reportMonthSelect');
  const months = getAvailableMonths();
  const lastMonth = getPrevMonth(currentMonth);

  sel.innerHTML = months.map(m =>
    `<option value="${m}" ${m === lastMonth ? 'selected' : ''}>${m}</option>`
  ).join('');
}

async function loadReport() {
  const month = document.getElementById('reportMonthSelect').value;
  const container = document.getElementById('reportContainer');

  try {
    const report = await fundApi.getReport(month);
    if (report) {
      container.innerHTML = `<div class="report-content">${escapeHtml(report.report_text)}</div>`;
    } else {
      const displayMonth = month.replace('-', '年') + '月';
      container.innerHTML = `<button class="btn-primary" id="generateBtn" onclick="generateReport()">一键生成 ${displayMonth} 报告</button>`;
    }
  } catch (e) {
    console.error('加载报告失败:', e);
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">加载失败</div>';
  }
}

async function generateReport() {
  const month = document.getElementById('reportMonthSelect').value;
  const container = document.getElementById('reportContainer');

  // 检查是否有数据
  const monthRecords = allRecords.filter(r => r.yearMonth === month);
  if (monthRecords.length === 0) {
    alert('该月份暂无资金记录，请先保存记录');
    return;
  }

  const displayMonth = month.replace('-', '年') + '月';
  container.innerHTML = `<div class="report-loading"><div class="spinner"></div>正在生成 ${displayMonth} 资金报告...</div>`;

  try {
    const result = await fundApi.generateReport(month);
    if (result && result.report) {
      container.innerHTML = `<div class="report-content">${escapeHtml(result.report)}</div>`;
    } else {
      container.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:20px;text-align:center;">报告生成失败，请稍后重试</div>
        <button class="btn-primary" onclick="generateReport()">重试</button>`;
    }
  } catch (e) {
    console.error('生成报告失败:', e);
    container.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:20px;text-align:center;">生成失败: ${e.message || '请稍后重试'}</div>
      <button class="btn-primary" onclick="generateReport()">重试</button>`;
  }
}

// ============ 工具函数 ============
function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPrevMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function getMonthTotal(yearMonth) {
  let total = 0;
  allSources.forEach(s => {
    total += getAmountForMonth(s.id, yearMonth);
  });
  return total;
}

function getAmountForMonth(sourceId, yearMonth) {
  // 取该月该来源的最新记录
  const records = allRecords.filter(r => r.sourceId === sourceId && r.yearMonth === yearMonth);
  return records.length > 0 ? records[records.length - 1].amount : 0;
}

function getLatestAmount(sourceId) {
  const records = allRecords.filter(r => r.sourceId === sourceId).sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  return records.length > 0 ? records[0].amount : 0;
}

function getMonthlyTotals() {
  const totals = {};
  allRecords.forEach(r => {
    if (!totals[r.yearMonth]) totals[r.yearMonth] = 0;
    totals[r.yearMonth] += r.amount;
  });
  return totals;
}

function getAvailableMonths() {
  const months = new Set();
  allRecords.forEach(r => months.add(r.yearMonth));

  // 确保至少有当前月和上月
  months.add(currentMonth);
  months.add(getPrevMonth(currentMonth));

  return [...months].sort().reverse();
}

function formatFundNumber(n) {
  return Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
