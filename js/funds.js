// ============ 全局状态 ============
let allSources = [];
let allRecords = [];
let allReports = [];
let currentMonth = getCurrentYearMonth();
let trendChart = null;
let pieChart = null;
let overviewMode = 'total';
let activeReportMonth = null;

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  if (!(await requireAuth())) return;
  await loadAllData();
  renderFillTab();
  renderOverviewTab();
  renderReportTab();
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

  // FAB 只在填写 tab 显示
  document.getElementById('fabBtn').style.display = tab === 'fill' ? 'flex' : 'none';

  // 切换到总览时刷新图表（Chart.js 需要可见才能正确渲染）
  if (tab === 'overview') {
    setTimeout(() => {
      renderTrendChart();
      renderPieChart();
    }, 50);
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ============ Tab 1: 填写资金 ============
function renderFillTab() {
  const container = document.getElementById('fillCards');
  const saveBtn = document.getElementById('saveFillBtn');

  if (allSources.length === 0) {
    container.innerHTML = `
      <div class="empty-hint">
        <div class="empty-hint-icon">💰</div>
        <div>还没有资金来源</div>
        <div style="margin-top:6px;font-size:0.8rem;">点击右下角 + 添加</div>
      </div>`;
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
          <div class="fund-card-name">
            <span class="fund-card-dot" style="background:${color}"></span>
            ${s.name}
          </div>
          <div class="fund-card-actions">
            <button class="fund-card-btn danger" onclick="deleteFundSource('${s.id}','${s.name}')" title="删除">✕</button>
          </div>
        </div>
        <div class="fund-card-input-row">
          <span class="fund-card-currency">¥</span>
          <input type="number" class="fund-card-input" data-source-id="${s.id}"
            placeholder="0.00" value="${hasRecord ? existing : ''}" step="0.01" min="0">
        </div>
        ${!hasRecord ? '<div class="fund-card-hint">本月尚未填写</div>' : ''}
      </div>`;
  }).join('');
}

async function saveFillRecords() {
  const inputs = document.querySelectorAll('#fillCards .fund-card-input');
  const records = [];
  inputs.forEach(input => {
    records.push({
      sourceId: input.dataset.sourceId,
      amount: parseFloat(input.value) || 0
    });
  });

  if (records.length === 0) return;

  try {
    await fundApi.saveRecords(currentMonth, records);
    allRecords = await fundApi.getAllRecords();
    renderFillTab();
    showToast('保存成功');
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'save-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}

// ============ 新增资金弹窗 ============
function showAddModal() {
  document.getElementById('addModal').classList.add('show');
  const input = document.getElementById('addModalInput');
  input.value = '';
  setTimeout(() => input.focus(), 100);
}

function hideAddModal() {
  document.getElementById('addModal').classList.remove('show');
}

document.getElementById('addModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideAddModal();
});

document.getElementById('addModalInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmAddSource();
});

async function confirmAddSource() {
  const input = document.getElementById('addModalInput');
  const name = input.value.trim();
  if (!name) return;

  try {
    await fundApi.addSource(name);
    allSources = await fundApi.getSources();
    hideAddModal();
    renderFillTab();
  } catch (e) {
    alert('添加失败: ' + e.message);
  }
}

async function deleteFundSource(id, name) {
  if (!confirm(`确定删除「${name}」？相关记录也会被删除。`)) return;
  try {
    await fundApi.deleteSource(id);
    allSources = await fundApi.getSources();
    allRecords = await fundApi.getAllRecords();
    renderFillTab();
    renderOverviewTab();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

// ============ Tab 2: 资金总览 ============
function renderOverviewTab() {
  updateOverviewCard();
  renderTrendChart();
  renderPieChart();
  renderOverviewTable();
}

function setOverviewMode(mode) {
  overviewMode = mode;
  document.querySelectorAll('.filter-bar .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(
      mode === 'total' ? '总资金' : mode === 'type' ? '类型' : '月份'
    ));
  });

  const select = document.getElementById('filterSelect');
  if (mode === 'type') {
    select.style.display = 'block';
    select.innerHTML = allSources.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  } else if (mode === 'month') {
    select.style.display = 'block';
    const months = getAvailableMonths();
    select.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
  } else {
    select.style.display = 'none';
  }

  updateOverviewCard();
  renderTrendChart();
  renderPieChart();
  renderOverviewTable();
}

function onFilterSelect() {
  updateOverviewCard();
  renderTrendChart();
  renderPieChart();
  renderOverviewTable();
}

function updateOverviewCard() {
  const amountEl = document.getElementById('overviewAmount');
  const changeEl = document.getElementById('overviewChange');
  const labelEl = document.querySelector('.overview-label');

  if (overviewMode === 'total') {
    const total = getMonthTotal(currentMonth);
    const prev = getMonthTotal(getPrevMonth(currentMonth));
    amountEl.textContent = '¥' + fmtNum(total);
    labelEl.textContent = '总资产';
    const diff = total - prev;
    if (prev > 0 || total > 0) {
      const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : '0.0';
      changeEl.textContent = `较上月 ${diff >= 0 ? '+' : ''}${fmtNum(diff)} (${diff >= 0 ? '+' : ''}${pct}%)`;
      changeEl.className = 'overview-sub ' + (diff >= 0 ? 'up' : 'down');
    } else {
      changeEl.textContent = '暂无数据';
      changeEl.className = 'overview-sub';
    }
  } else if (overviewMode === 'type') {
    const sourceId = document.getElementById('filterSelect').value;
    const source = allSources.find(s => s.id === sourceId);
    if (!source) { amountEl.textContent = '--'; return; }
    const amt = getAmountForMonth(sourceId, currentMonth);
    const prev = getAmountForMonth(sourceId, getPrevMonth(currentMonth));
    amountEl.textContent = '¥' + fmtNum(amt);
    labelEl.textContent = source.name + ' 资产';
    const diff = amt - prev;
    if (prev > 0 || amt > 0) {
      const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : '0.0';
      changeEl.textContent = `较上月 ${diff >= 0 ? '+' : ''}${fmtNum(diff)} (${diff >= 0 ? '+' : ''}${pct}%)`;
      changeEl.className = 'overview-sub ' + (diff >= 0 ? 'up' : 'down');
    } else {
      changeEl.textContent = '暂无数据';
      changeEl.className = 'overview-sub';
    }
  } else {
    const month = document.getElementById('filterSelect').value || currentMonth;
    const total = getMonthTotal(month);
    amountEl.textContent = '¥' + fmtNum(total);
    labelEl.textContent = month + ' 总资产';
    const prev = getMonthTotal(getPrevMonth(month));
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
}

function renderTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  if (trendChart) trendChart.destroy();

  let data = [];

  if (overviewMode === 'total') {
    const totals = getMonthlyTotals();
    data = Object.entries(totals).map(([m, t]) => ({ month: m, value: t }));
  } else if (overviewMode === 'type') {
    const sourceId = document.getElementById('filterSelect')?.value;
    if (!sourceId) return;
    const map = {};
    allRecords.filter(r => r.sourceId === sourceId).forEach(r => {
      map[r.yearMonth] = r.amount;
    });
    data = Object.entries(map).map(([m, v]) => ({ month: m, value: v }));
  } else {
    const month = document.getElementById('filterSelect')?.value || currentMonth;
    const totals = getMonthlyTotals();
    data = Object.entries(totals).map(([m, t]) => ({ month: m, value: t }));
    // 高亮选中月份
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
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 5, color: '#6b7280', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: v => '¥' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : v) } }
      }
    }
  });
}

function renderPieChart() {
  const ctx = document.getElementById('pieChart');
  if (!ctx) return;
  if (pieChart) pieChart.destroy();

  let month = currentMonth;
  if (overviewMode === 'month') {
    month = document.getElementById('filterSelect')?.value || currentMonth;
  }

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
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      plugins: { legend: { display: false } }
    }
  });

  const total = items.reduce((s, i) => s + i.amount, 0);
  document.getElementById('pieLegend').innerHTML = items.map(s => {
    const pct = total > 0 ? ((s.amount / total) * 100).toFixed(1) : '0';
    return `<div class="legend-item">
      <span class="legend-dot" style="background:${s.color}"></span>
      <span class="legend-name">${s.name}</span>
      <span class="legend-val">¥${fmtNum(s.amount)} (${pct}%)</span>
    </div>`;
  }).join('');
}

function renderOverviewTable() {
  const tbody = document.getElementById('overviewTable');
  const totals = getMonthlyTotals();
  let data = Object.entries(totals).map(([m, t]) => ({ month: m, total: t })).sort((a, b) => b.month.localeCompare(a.month));

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">暂无记录</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((d, i) => {
    const prev = data[i + 1];
    const lastYear = data.find(x => x.month === d.month.replace(/\d{4}/, m => String(Number(m) - 1)));

    let change = '-', mom = '-', yoy = '-';
    if (prev) {
      const diff = d.total - prev.total;
      change = `${diff >= 0 ? '+' : ''}¥${fmtNum(diff)}`;
      if (prev.total > 0) mom = `${((diff / prev.total) * 100).toFixed(1)}%`;
    }
    if (lastYear && lastYear.total > 0) {
      yoy = `${((d.total - lastYear.total) / lastYear.total * 100).toFixed(1)}%`;
    }

    return `<tr>
      <td>${d.month}</td>
      <td class="mono">¥${fmtNum(d.total)}</td>
      <td class="mono" style="color:${(d.total - (prev?.total || 0)) >= 0 ? 'var(--success)' : 'var(--danger)'}">${change}</td>
      <td class="mono">${mom}</td>
      <td class="mono">${yoy}</td>
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
    container.innerHTML = `
      <div class="report-month-label">${displayMonth} 资金报告</div>
      <div class="report-body">${escapeHtml(report.report_text)}</div>`;
  } else {
    // 检查该月是否有记录
    const hasRecords = allRecords.some(r => r.yearMonth === targetMonth);
    if (!hasRecords) {
      container.innerHTML = `
        <div class="report-empty">
          <div class="report-empty-icon">📝</div>
          <div class="report-empty-text">${displayMonth} 暂无资金记录</div>
          <div style="margin-top:4px;font-size:0.8rem;color:var(--text-muted);">请先在"填写资金"中记录该月数据</div>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="report-month-label">${displayMonth} 资金报告</div>
        <button class="btn-generate" onclick="generateReport('${targetMonth}')">
          一键生成 ${displayMonth} 报告
        </button>`;
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
    const isActive = r.year_month === activeReportMonth;
    return `<div class="history-item ${isActive ? 'active' : ''}" onclick="selectHistoryReport('${r.year_month}')">${display}报告</div>`;
  }).join('');
}

function toggleHistory() {
  const list = document.getElementById('historyList');
  const arrow = document.getElementById('historyArrow');
  list.classList.toggle('show');
  arrow.classList.toggle('open');
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
      // 刷新报告列表
      allReports = await fundApi.getReports();
      container.innerHTML = `
        <div class="report-month-label">${displayMonth} 资金报告</div>
        <div class="report-body">${escapeHtml(result.report)}</div>`;
      renderHistoryList();
    } else {
      container.innerHTML = `
        <div style="text-align:center;padding:20px;">
          <div style="color:var(--text-muted);margin-bottom:12px;">生成失败，请稍后重试</div>
          <button class="btn-generate" onclick="generateReport('${month}')">重试</button>
        </div>`;
    }
  } catch (e) {
    console.error('生成报告失败:', e);
    container.innerHTML = `
      <div style="text-align:center;padding:20px;">
        <div style="color:var(--text-muted);margin-bottom:12px;">${e.message || '生成失败'}</div>
        <button class="btn-generate" onclick="generateReport('${month}')">重试</button>
      </div>`;
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
  allRecords.forEach(r => {
    totals[r.yearMonth] = (totals[r.yearMonth] || 0) + r.amount;
  });
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
