let currentPlan = null;
let selectedResult = null;
let planProfitChart = null;
let planGroupBy = 'day';
let planRange = '1m';
let planCalendarView = 'day';
let planCalendarDate = new Date();
let actionRecordId = null;

// 每种分组下的时间范围选项及默认值
const PLAN_RANGE_OPTIONS = {
  day:   [{ label: '近1月', value: '1m' }, { label: '近3月', value: '3m' }, { label: '近6月', value: '6m' }, { label: '近1年', value: '1y' }, { label: '全部', value: 'all' }],
  week:  [{ label: '近3月', value: '3m' }, { label: '近6月', value: '6m' }, { label: '近1年', value: '1y' }, { label: '近2年', value: '2y' }, { label: '全部', value: 'all' }],
  month: [{ label: '近1年', value: '1y' }, { label: '近2年', value: '2y' }, { label: '近3年', value: '3y' }, { label: '近5年', value: '5y' }, { label: '全部', value: 'all' }]
};
const PLAN_RANGE_DEFAULTS = { day: '1m', week: '3m', month: '1y' };

function getPlanId() {
  return new URLSearchParams(window.location.search).get('id');
}

document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();

  // 检查登录状态
  if (!(await requireAuth())) return;

  const planId = getPlanId();
  if (!planId) return;
  try { await loadPlan(planId); } catch (e) { console.error('加载出错:', e); }
  document.getElementById('recordDate').valueAsDate = new Date();
});

async function loadPlan(planId) {
  await waitForSupabase();
  currentPlan = await api.getPlan(planId);
  console.log('[plan] loadPlan records:', currentPlan.records ? currentPlan.records.length : 0);
  renderPlanInfo();
  renderRecords();
  renderPlanRangeButtons();
  renderPlanProfitChart();
  renderPlanCalendar();
}

function renderPlanInfo() {
  document.getElementById('planName').textContent = currentPlan.name;
  const statusEl = document.getElementById('planStatus');
  statusEl.textContent = currentPlan.status === 'active' ? '进行中' : '已暂停';
  statusEl.className = `plan-status ${currentPlan.status}`;
  const toggleBtn = document.getElementById('toggleStatusBtn');
  toggleBtn.textContent = currentPlan.status === 'active' ? '暂停' : '恢复';
  toggleBtn.className = `btn btn-sm ${currentPlan.status === 'active' ? 'btn-warning' : 'btn-success'}`;

  // 计算汇总数据
  let totalInvested = 0, totalReturned = 0;
  const records = currentPlan.records;
  records.forEach(r => { totalInvested += r.betAmount; totalReturned += r.winAmount; });
  const totalProfit = totalReturned - totalInvested;

  // 昨日数据（严格昨天）
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  const yesterdayRecords = records.filter(r => r.date === yesterdayStr);
  let yProfit = 0, yInvested = 0;
  if (yesterdayRecords.length > 0) {
    yesterdayRecords.forEach(r => { yInvested += r.betAmount; if (r.result) yProfit += r.profit; });
  }

  // 渲染总览卡片
  const profitEl = document.getElementById('planTotalProfit');
  profitEl.textContent = formatPlanNumber(totalProfit, true);
  profitEl.className = 'summary-big-value ' + (totalProfit >= 0 ? 'positive' : 'negative');

  const yProfitEl = document.getElementById('planYesterdayProfit');
  if (yesterdayRecords.length > 0) {
    yProfitEl.textContent = formatPlanNumber(yProfit, true);
    yProfitEl.className = 'summary-col-value ' + (yProfit >= 0 ? 'positive' : 'negative');
  } else {
    yProfitEl.textContent = '-';
  }

  document.getElementById('planYesterdayInvested').textContent = yesterdayRecords.length > 0 ? formatPlanNumber(yInvested) : '-';
  document.getElementById('planTotalInvested').textContent = formatPlanNumber(totalInvested);
}

function formatPlanNumber(n, showSign) {
  const prefix = showSign ? (n >= 0 ? '+' : '-') : '';
  return prefix + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function renderRecords() {
  const tbody = document.getElementById('recordsTable');
  const emptyEl = document.getElementById('emptyRecords');
  if (currentPlan.records.length === 0) { tbody.innerHTML = ''; emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';

  const sortedRecords = [...currentPlan.records].reverse();
  const groups = {};
  sortedRecords.forEach(r => { const m = r.date.substring(0, 7); if (!groups[m]) groups[m] = []; groups[m].push(r); });
  const now = new Date();
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = Object.keys(groups).sort().reverse();

  let html = '';
  months.forEach(month => {
    const mr = groups[month], isCur = month === cm;
    let tb = 0, tp = 0;
    mr.forEach(r => { tb += r.betAmount; if (r.result) tp += r.profit; });
    const [y, mon] = month.split('-');
    const pc = tp > 0 ? 'win' : tp < 0 ? 'lose' : '';

    html += `<tr id="plan-header-${month}" class="month-group-header ${isCur ? 'expanded' : ''}" onclick="togglePlanMonthGroup('${month}')"><td colspan="5"><div class="month-header-content"><div class="month-label"><span class="arrow">▶</span><span>${y}年${parseInt(mon)}月</span><span class="month-count">${mr.length}条</span></div><div class="month-stats"><span class="stat-item ${pc}">净收益 ${tp >= 0 ? '+' : ''}${tp.toFixed(0)}</span></div></div></td></tr>`;

    mr.forEach(record => {
      const hid = isCur ? '' : 'hidden';
      const mmdd = record.date.substring(5);
      html += `<tr class="month-row plan-group-${month} ${hid}" data-record-id="${record.id}" data-bet-amount="${record.betAmount}" onclick="showRecordActionModal('${record.id}')"><td class="td-date">${mmdd}</td><td class="td-num">${record.betAmount.toFixed(0)}</td><td class="${record.result === 'win' ? 'win' : record.result === 'lose' ? 'lose' : ''}">${record.result === 'win' ? '中' : record.result === 'lose' ? '未中' : '-'}</td><td class="td-num">${record.winAmount > 0 ? record.winAmount.toFixed(0) : '-'}</td><td class="td-num ${record.profit > 0 ? 'win' : record.profit < 0 ? 'lose' : ''}">${record.result ? record.profit.toFixed(0) : '-'}</td></tr>`;
    });
  });
  tbody.innerHTML = html;
}

function togglePlanMonthGroup(month) {
  document.getElementById(`plan-header-${month}`).classList.toggle('expanded');
  document.querySelectorAll(`.plan-group-${month}`).forEach(r => r.classList.toggle('hidden'));
}

// 添加投注记录
document.getElementById('addRecordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = document.getElementById('recordDate').value;
  const betAmount = document.getElementById('betAmount').value;
  try { await api.addRecord(currentPlan.id, { date, betAmount: Number(betAmount) }); loadPlan(currentPlan.id); document.getElementById('betAmount').value = ''; }
  catch (error) { alert(error.message); }
});

function showResultModal(recordId) {
  document.getElementById('resultDate').value = recordId;
  document.getElementById('winAmountGroup').style.display = 'none';
  document.getElementById('winAmount').value = '';
  selectedResult = null;
  document.getElementById('resultModal').classList.add('show');
}
function hideResultModal() { document.getElementById('resultModal').classList.remove('show'); }

function selectResult(result) {
  selectedResult = result;
  document.getElementById('winAmountGroup').style.display = result === 'win' ? 'block' : 'none';
  document.querySelector('#resultForm .btn-success').classList.toggle('selected', result === 'win');
  document.querySelector('#resultForm .btn-danger').classList.toggle('selected', result === 'lose');
}

document.getElementById('resultForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedResult) { alert('请选择投注结果'); return; }
  const recordId = document.getElementById('resultDate').value;
  const winAmount = selectedResult === 'win' ? Number(document.getElementById('winAmount').value) : 0;
  if (selectedResult === 'win' && !winAmount) { alert('请填写中奖金额'); return; }
  try { await api.updateRecord(currentPlan.id, recordId, { result: selectedResult, winAmount }); hideResultModal(); loadPlan(currentPlan.id); }
  catch (error) { alert(error.message); }
});

async function toggleStatus() {
  try { await api.updatePlanStatus(currentPlan.id); loadPlan(currentPlan.id); }
  catch (error) { alert(error.message); }
}

function showEditAmountModal(recordId, betAmount) {
  document.getElementById('editAmountDate').value = recordId;
  document.getElementById('newBetAmount').value = betAmount;
  document.getElementById('editAmountModal').classList.add('show');
}
function hideEditAmountModal() { document.getElementById('editAmountModal').classList.remove('show'); }

document.getElementById('editAmountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const recordId = document.getElementById('editAmountDate').value;
  const betAmount = document.getElementById('newBetAmount').value;
  try { await api.updateRecord(currentPlan.id, recordId, { betAmount: Number(betAmount) }); hideEditAmountModal(); loadPlan(currentPlan.id); }
  catch (error) { alert(error.message); }
});

// ========== 图表 ==========

function getPlanDailyProfits() {
  if (!currentPlan || !currentPlan.records) return [];
  const sorted = [...currentPlan.records].sort((a, b) => a.date.localeCompare(b.date));
  const dm = {};
  sorted.forEach(r => {
    if (!dm[r.date]) dm[r.date] = { profit: 0, settled: false };
    if (r.result) { dm[r.date].profit += r.profit; dm[r.date].settled = true; }
  });
  let cum = 0;
  return Object.keys(dm).sort().filter(d => dm[d].settled).map(d => { cum += dm[d].profit; return { date: d, profit: dm[d].profit, cumulative: cum }; });
}

// 按周聚合
function planAggregateByWeek(dailyProfits) {
  const weekMap = {};
  dailyProfits.forEach(item => {
    const d = new Date(item.date);
    const dayOfWeek = d.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    if (!weekMap[weekKey]) weekMap[weekKey] = { date: weekKey, cumulative: 0, profit: 0 };
    weekMap[weekKey].cumulative = item.cumulative;
    weekMap[weekKey].profit += item.profit;
  });
  return Object.values(weekMap).sort((a, b) => a.date.localeCompare(b.date));
}

// 按月聚合
function planAggregateByMonth(dailyProfits) {
  const monthMap = {};
  dailyProfits.forEach(item => {
    const monthKey = item.date.substring(0, 7);
    if (!monthMap[monthKey]) monthMap[monthKey] = { date: monthKey, cumulative: 0, profit: 0 };
    monthMap[monthKey].cumulative = item.cumulative;
    monthMap[monthKey].profit += item.profit;
  });
  return Object.values(monthMap).sort((a, b) => a.date.localeCompare(b.date));
}

// 根据范围过滤日期列表
function planFilterByRange(dates) {
  if (planRange === 'all' || dates.length === 0) return dates;
  const lastDate = dates[dates.length - 1];
  const endDate = new Date(lastDate);
  let monthsBack;
  switch (planRange) {
    case '1m': monthsBack = 1; break;
    case '3m': monthsBack = 3; break;
    case '6m': monthsBack = 6; break;
    case '1y': monthsBack = 12; break;
    case '2y': monthsBack = 24; break;
    case '3y': monthsBack = 36; break;
    case '5y': monthsBack = 60; break;
    default: return dates;
  }
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - monthsBack);
  const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
  return dates.filter(d => d >= startStr);
}

// 切换分组
function switchPlanChartGroup(group) {
  console.log('[plan] switchPlanChartGroup:', group);
  planGroupBy = group;
  planRange = PLAN_RANGE_DEFAULTS[group];
  renderPlanRangeButtons();
  renderPlanProfitChart();
}

// 切换时间范围
function switchPlanChartRange(range) {
  planRange = range;
  document.querySelectorAll('#planChartRangeBar .chart-range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
  renderPlanProfitChart();
}

// 渲染时间范围按钮
function renderPlanRangeButtons() {
  const bar = document.getElementById('planChartRangeBar');
  if (!bar) { console.error('[plan] planChartRangeBar not found'); return; }
  const options = PLAN_RANGE_OPTIONS[planGroupBy];
  if (!options) { console.error('[plan] no options for', planGroupBy); return; }
  const html = options.map(opt =>
    `<button class="chart-range-btn${opt.value === planRange ? ' active' : ''}" data-range="${opt.value}" onclick="switchPlanChartRange('${opt.value}')">${opt.label}</button>`
  ).join('');
  bar.innerHTML = html;
  console.log('[plan] renderPlanRangeButtons:', planGroupBy, '→', bar.children.length, 'buttons');
}

function renderPlanProfitChart() {
  const ctx = document.getElementById('planProfitChart');
  if (!ctx) return;
  if (planProfitChart) planProfitChart.destroy();
  const dp = getPlanDailyProfits();
  if (dp.length === 0) return;

  let points = [];
  if (planGroupBy === 'day') {
    points = dp.map(i => ({ label: i.date, value: i.cumulative }));
  } else if (planGroupBy === 'week') {
    points = planAggregateByWeek(dp).map(w => ({ label: w.date, value: w.cumulative }));
  } else {
    points = planAggregateByMonth(dp).map(m => ({ label: m.date, value: m.cumulative }));
  }

  const allLabels = points.map(p => p.label);
  const filteredLabels = planFilterByRange(allLabels);
  const filteredPoints = points.filter(p => filteredLabels.includes(p.label));
  if (filteredPoints.length === 0) return;

  const labels = filteredPoints.map(p => p.label);
  const data = filteredPoints.map(p => p.value);

  planProfitChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.1)', fill: true, tension: .3, pointRadius: 4, pointBackgroundColor: '#f59e0b' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y.toFixed(2) } } }, scales: { x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { maxTicksLimit: 6, color: '#6b7280', font: { size: 11 } } }, y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { callback: v => v, color: '#6b7280', font: { size: 11 } } } } }
  });
}

// ========== 日历 ==========

function buildPlanProfitMap() {
  const m = {};
  if (currentPlan && currentPlan.records) {
    currentPlan.records.forEach(r => { if (r.result) { if (!m[r.date]) m[r.date] = 0; m[r.date] += r.profit; } });
  }
  return m;
}

function renderPlanCalendar() {
  const c = document.getElementById('planCalendarContainer');
  const t = document.getElementById('planCalendarTitle');
  const pm = buildPlanProfitMap();
  if (planCalendarView === 'year') renderPlanYearCalendar(c, t, pm);
  else if (planCalendarView === 'month') renderPlanMonthCalendar(c, t, pm);
  else renderPlanDayCalendar(c, t, pm);
}

function renderPlanYearCalendar(c, t, pm) {
  const y = planCalendarDate.getFullYear();
  t.textContent = `${y - 1} - ${y + 1}`;
  let h = '<div class="year-grid">';
  for (let yr = y - 1; yr <= y + 1; yr++) {
    let yp = 0;
    for (let m = 0; m < 12; m++) {
      const dim = new Date(yr, m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const ds = `${yr}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (pm[ds]) yp += pm[ds];
      }
    }
    const cls = yp > 0 ? 'profit-up' : yp < 0 ? 'profit-down' : '';
    const pc = yp > 0 ? 'positive' : yp < 0 ? 'negative' : '';
    const txt = yp !== 0 ? `${yp > 0 ? '+' : ''}${yp.toFixed(0)}` : '-';
    h += `<div class="year-month-box ${cls}" onclick="jumpPlanToYear(${yr})"><div class="month-name">${yr}年</div><div class="month-profit ${pc}">${txt}</div></div>`;
  }
  c.innerHTML = h + '</div>';
}

function renderPlanMonthCalendar(c, t, pm) {
  const y = planCalendarDate.getFullYear();
  t.textContent = `${y}年`;
  let h = '<div class="year-grid">';
  for (let m = 0; m < 12; m++) {
    let mp = 0;
    const dim = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (pm[ds]) mp += pm[ds];
    }
    const cls = mp > 0 ? 'profit-up' : mp < 0 ? 'profit-down' : '';
    const pc = mp > 0 ? 'positive' : mp < 0 ? 'negative' : '';
    const txt = mp !== 0 ? `${mp > 0 ? '+' : ''}${mp.toFixed(0)}` : '-';
    h += `<div class="year-month-box ${cls}" onclick="jumpPlanToMonth(${y},${m})"><div class="month-name">${m + 1}月</div><div class="month-profit ${pc}">${txt}</div></div>`;
  }
  c.innerHTML = h + '</div>';
}

function renderPlanDayCalendar(c, t, pm) {
  const y = planCalendarDate.getFullYear(), m = planCalendarDate.getMonth();
  t.textContent = `${y}年${m + 1}月`;
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0), sd = first.getDay();
  let h = '<div class="day-grid"><div class="day-header">日</div><div class="day-header">一</div><div class="day-header">二</div><div class="day-header">三</div><div class="day-header">四</div><div class="day-header">五</div><div class="day-header">六</div>';
  for (let i = 0; i < sd; i++) h += '<div class="day-cell empty"></div>';
  for (let d = 1; d <= last.getDate(); d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const p = pm[ds], cls = p > 0 ? 'profit-up' : p < 0 ? 'profit-down' : '';
    const pc = p > 0 ? 'positive' : p < 0 ? 'negative' : '';
    const txt = p !== undefined ? `${p > 0 ? '+' : ''}${p.toFixed(0)}` : '';
    h += `<div class="day-cell ${cls}"><span class="day-num">${d}</span><span class="day-profit ${pc}">${txt}</span></div>`;
  }
  c.innerHTML = h + '</div>';
}

function jumpPlanToYear(yr) { planCalendarDate = new Date(yr, 0, 1); planCalendarView = 'month'; updatePlanCalendarTabs('月'); renderPlanCalendar(); }
function jumpPlanToMonth(y, m) { planCalendarDate = new Date(y, m, 1); planCalendarView = 'day'; updatePlanCalendarTabs('日'); renderPlanCalendar(); }

function navigatePlanCalendar(direction) {
  if (planCalendarView === 'year') planCalendarDate.setFullYear(planCalendarDate.getFullYear() + direction);
  else if (planCalendarView === 'month') planCalendarDate.setFullYear(planCalendarDate.getFullYear() + direction);
  else planCalendarDate.setMonth(planCalendarDate.getMonth() + direction);
  renderPlanCalendar();
}

function switchPlanCalendarView(view) {
  planCalendarView = view;
  updatePlanCalendarTabs(view === 'day' ? '日' : view === 'month' ? '月' : '年');
  renderPlanCalendar();
}

function updatePlanCalendarTabs(activeText) {
  // 只更新日历的tab（找到planCalendarContainer的父级chart-container）
  const calContainer = document.getElementById('planCalendarContainer');
  if (calContainer) {
    const container = calContainer.closest('.chart-container');
    if (container) {
      container.querySelectorAll('.chart-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent === activeText) tab.classList.add('active');
      });
    }
  }
}

// ========== 记录操作弹窗 ==========

function showRecordActionModal(recordId) {
  actionRecordId = recordId;
  const record = currentPlan.records.find(r => r.id === recordId);
  // 动态更新"填写结果"按钮文案
  const fillBtn = document.querySelector('#recordActionModal .record-action-btn:nth-child(2) span:last-child');
  if (fillBtn) fillBtn.textContent = record && record.result ? '修改结果' : '填写结果';
  document.getElementById('recordActionModal').classList.add('show');
}

function hideRecordActionModal() {
  document.getElementById('recordActionModal').classList.remove('show');
  actionRecordId = null;
}

function onActionEditAmount() {
  if (!actionRecordId) return;
  const row = document.querySelector('tr[data-record-id="' + actionRecordId + '"]');
  showEditAmountModal(actionRecordId, parseFloat(row.dataset.betAmount));
  hideRecordActionModal();
}

function onActionFillResult() {
  if (!actionRecordId) return;
  showResultModal(actionRecordId);
  hideRecordActionModal();
}

function onActionDelete() {
  var id = actionRecordId;
  hideRecordActionModal();
  actionRecordId = id;
  showDeleteConfirm();
}

function showDeleteConfirm() {
  document.getElementById('deleteConfirmModal').classList.add('show');
}

function hideDeleteConfirm() {
  document.getElementById('deleteConfirmModal').classList.remove('show');
  actionRecordId = null;
}

async function confirmDeleteRecord() {
  if (!actionRecordId) return;
  try {
    await api.deleteRecord(actionRecordId);
    hideDeleteConfirm();
    loadPlan(currentPlan.id);
  } catch (error) {
    alert(error.message);
  }
}
