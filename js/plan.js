let currentPlan = null;
let selectedResult = null;
let planProfitChart = null;
let planChartView = 'day';
let planCalendarView = 'day';
let planCalendarDate = new Date();
let longPressTimer = null;
let longPressRecordId = null;

function getPlanId() {
  return new URLSearchParams(window.location.search).get('id');
}

document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();

  // 检查登录状态
  if (!requireAuth()) return;

  // 显示用户邮箱
  const user = getCurrentUser();
  if (user) {
    document.getElementById('userEmail').textContent = user.email;
  }

  const planId = getPlanId();
  if (!planId) return;
  try { await loadPlan(planId); } catch (e) { console.error('加载出错:', e); }
  document.getElementById('recordDate').valueAsDate = new Date();
  initContextMenu();
});

async function loadPlan(planId) {
  await waitForSupabase();
  currentPlan = await api.getPlan(planId);
  renderPlanInfo();
  renderRecords();
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
      html += `<tr class="month-row plan-group-${month} ${hid}" data-record-id="${record.id}" data-bet-amount="${record.betAmount}"><td class="td-date">${mmdd}</td><td class="td-num">${record.betAmount.toFixed(0)}</td><td class="${record.result === 'win' ? 'win' : record.result === 'lose' ? 'lose' : ''}">${record.result === 'win' ? '中' : record.result === 'lose' ? '未中' : '-'}</td><td class="td-num">${record.winAmount > 0 ? record.winAmount.toFixed(0) : '-'}</td><td class="td-num ${record.profit > 0 ? 'win' : record.profit < 0 ? 'lose' : ''}">${record.result ? record.profit.toFixed(0) : '-'}</td></tr>`;
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

function renderPlanProfitChart() {
  const ctx = document.getElementById('planProfitChart');
  if (!ctx) return;
  if (planProfitChart) planProfitChart.destroy();
  const dp = getPlanDailyProfits();
  if (dp.length === 0) return;

  let labels = [], data = [];
  if (planChartView === 'day') {
    labels = dp.map(i => i.date); data = dp.map(i => i.cumulative);
  } else {
    const m = {}; dp.forEach(i => { m[i.date.substring(0, 7)] = i.cumulative; });
    labels = Object.keys(m).sort(); data = labels.map(k => m[k]);
  }

  planProfitChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.1)', fill: true, tension: .3, pointRadius: 4, pointBackgroundColor: '#f59e0b' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y.toFixed(2) } } }, scales: { x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { maxTicksLimit: 3, color: '#6b7280' } }, y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { callback: v => v, color: '#6b7280' } } } }
  });
}

function switchPlanChartView(view) {
  planChartView = view;
  // 只更新趋势图的tab（找到canvas的父级chart-container）
  const canvas = document.getElementById('planProfitChart');
  if (canvas) {
    const container = canvas.closest('.chart-container');
    if (container) {
      container.querySelectorAll('.chart-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent === (view === 'day' ? '日' : '月')) tab.classList.add('active');
      });
    }
  }
  renderPlanProfitChart();
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

// ========== 长按上下文菜单 ==========

function initContextMenu() {
  const menu = document.getElementById('contextMenu');
  const table = document.getElementById('recordsTable');

  // 长按触发
  table.addEventListener('touchstart', (e) => {
    const row = e.target.closest('tr[data-record-id]');
    if (!row) return;
    longPressRecordId = row.dataset.recordId;
    longPressTimer = setTimeout(() => {
      e.preventDefault();
      const touch = e.touches[0];
      showContextMenu(touch.clientX, touch.clientY, row);
    }, 500);
  });

  table.addEventListener('touchend', () => clearTimeout(longPressTimer));
  table.addEventListener('touchmove', () => clearTimeout(longPressTimer));

  // 右键触发（桌面端）
  table.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('tr[data-record-id]');
    if (!row) return;
    e.preventDefault();
    longPressRecordId = row.dataset.recordId;
    showContextMenu(e.clientX, e.clientY, row);
  });

  // 点击其他地方关闭
  document.addEventListener('click', () => hideContextMenu());
  document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.context-menu')) hideContextMenu();
  });

  // 菜单操作
  document.getElementById('ctxEditAmount').addEventListener('click', () => {
    if (!longPressRecordId) return;
    const row = document.querySelector(`tr[data-record-id="${longPressRecordId}"]`);
    showEditAmountModal(longPressRecordId, parseFloat(row.dataset.betAmount));
    hideContextMenu();
  });

  document.getElementById('ctxFillResult').addEventListener('click', () => {
    if (!longPressRecordId) return;
    showResultModal(longPressRecordId);
    hideContextMenu();
  });
}

function showContextMenu(x, y, row) {
  const menu = document.getElementById('contextMenu');
  const record = currentPlan.records.find(r => r.id === longPressRecordId);
  document.getElementById('ctxFillResult').textContent = record && record.result ? '修改结果' : '填写结果';

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('show');

  // 防止超出屏幕
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
  });
}

function hideContextMenu() {
  document.getElementById('contextMenu').classList.remove('show');
}
