let historyData = null;
let currentCalendarView = 'day';
let currentChartView = 'day';
let currentDate = new Date();
let profitChart = null;
let sortDirection = null; // null=按时间, 'desc'=盈亏降序, 'asc'=盈亏升序
let selectedDate = null;
let currentDetailType = 'day';
let selectedYear = null;
let selectedMonth = null;

// 页面加载
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  loadHistory();
});

// 加载历史数据
async function loadHistory() {
  try {
    historyData = await api.getHistory();
    renderProfitChart();
    renderCalendar();
    showRecordsForDate(formatDate(new Date()));
  } catch (error) {
    console.error('加载历史失败:', error);
  }
}

// 切换图表视图
function switchChartView(view) {
  currentChartView = view;
  // 只更新趋势图的tab
  const canvas = document.getElementById('profitChart');
  if (canvas) {
    const container = canvas.closest('.chart-container');
    if (container) {
      container.querySelectorAll('.chart-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent === (view === 'day' ? '日' : view === 'month' ? '月' : '年')) {
          tab.classList.add('active');
        }
      });
    }
  }
  renderProfitChart();
}

// 渲染折线图
function renderProfitChart() {
  const ctx = document.getElementById('profitChart').getContext('2d');
  if (profitChart) profitChart.destroy();
  if (!historyData.dailyProfits || historyData.dailyProfits.length === 0) return;

  let labels = [], data = [];

  if (currentChartView === 'day') {
    labels = historyData.dailyProfits.map(i => i.date);
    data = historyData.dailyProfits.map(i => i.cumulative);
  } else if (currentChartView === 'month') {
    const m = {};
    historyData.dailyProfits.forEach(i => { m[i.date.substring(0, 7)] = i.cumulative; });
    labels = Object.keys(m).sort();
    data = labels.map(k => m[k]);
  } else {
    const y = {};
    historyData.dailyProfits.forEach(i => { y[i.date.substring(0, 4)] = i.cumulative; });
    labels = Object.keys(y).sort();
    data = labels.map(k => y[k]);
  }

  profitChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true, tension: 0.3,
        pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#f59e0b',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y.toFixed(2) } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { maxTicksLimit: 3, color: '#6b7280', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { callback: v => v, color: '#6b7280', font: { size: 11 } } }
      }
    }
  });
}

// 切换日历视图
function switchCalendarView(view) {
  currentCalendarView = view;
  // 只更新日历的tab
  const calContainer = document.getElementById('calendarContainer');
  if (calContainer) {
    const container = calContainer.closest('.chart-container');
    if (container) {
      container.querySelectorAll('.chart-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent === (view === 'day' ? '日' : view === 'month' ? '月' : '年')) {
          tab.classList.add('active');
        }
      });
    }
  }
  renderCalendar();
}

// 导航日历
function navigateCalendar(direction) {
  if (currentCalendarView === 'year') {
    currentDate.setFullYear(currentDate.getFullYear() + direction);
  } else if (currentCalendarView === 'month') {
    currentDate.setFullYear(currentDate.getFullYear() + direction);
  } else {
    currentDate.setMonth(currentDate.getMonth() + direction);
  }
  renderCalendar();
}

// 构建收益映射
function buildProfitMap() {
  const m = {};
  if (historyData && historyData.dailyProfits) {
    historyData.dailyProfits.forEach(i => { m[i.date] = i.profit; });
  }
  return m;
}

// 渲染日历
function renderCalendar() {
  const c = document.getElementById('calendarContainer');
  const t = document.getElementById('calendarTitle');
  const pm = buildProfitMap();
  if (currentCalendarView === 'year') renderYearCalendar(c, t, pm);
  else if (currentCalendarView === 'month') renderMonthCalendar(c, t, pm);
  else renderDayCalendar(c, t, pm);
}

// 年视图：多年
function renderYearCalendar(c, t, pm) {
  const y = currentDate.getFullYear();
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
    h += `<div class="year-month-box ${cls}" onclick="showYearSummary(${yr})"><div class="month-name">${yr}年</div><div class="month-profit ${pc}">${txt}</div></div>`;
  }
  c.innerHTML = h + '</div>';
}

// 月视图：12个月
function renderMonthCalendar(c, t, pm) {
  const y = currentDate.getFullYear();
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
    h += `<div class="year-month-box ${cls}" onclick="showMonthSummary(${y},${m})"><div class="month-name">${m + 1}月</div><div class="month-profit ${pc}">${txt}</div></div>`;
  }
  c.innerHTML = h + '</div>';
}

// 日视图：一个月
function renderDayCalendar(c, t, pm) {
  const y = currentDate.getFullYear(), m = currentDate.getMonth();
  t.textContent = `${y}年${m + 1}月`;
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0), sd = first.getDay();
  let h = '<div class="day-grid"><div class="day-header">日</div><div class="day-header">一</div><div class="day-header">二</div><div class="day-header">三</div><div class="day-header">四</div><div class="day-header">五</div><div class="day-header">六</div>';
  for (let i = 0; i < sd; i++) h += '<div class="day-cell empty"></div>';
  for (let d = 1; d <= last.getDate(); d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const p = pm[ds], cls = p > 0 ? 'profit-up' : p < 0 ? 'profit-down' : '';
    const pc = p > 0 ? 'positive' : p < 0 ? 'negative' : '';
    const txt = p !== undefined ? `${p > 0 ? '+' : ''}${p.toFixed(0)}` : '';
    h += `<div class="day-cell ${cls}" onclick="showRecordsForDate('${ds}')"><span class="day-num">${d}</span><span class="day-profit ${pc}">${txt}</span></div>`;
  }
  c.innerHTML = h + '</div>';
}

// 显示某年按计划汇总
function showYearSummary(year, resetSort) {
  const records = historyData.allRecords.filter(r => r.date.startsWith(`${year}-`));
  document.getElementById('recordsDate').textContent = `${year}年`;
  currentDetailType = 'year';
  selectedYear = year;
  selectedMonth = null;
  if (resetSort !== false) {
    sortDirection = null;
    updateSortArrows();
  }
  showPlanSummary(records);
}

// 显示某月按计划汇总
function showMonthSummary(year, month, resetSort) {
  const ms = `${year}-${String(month + 1).padStart(2, '0')}`;
  const records = historyData.allRecords.filter(r => r.date.startsWith(ms));
  document.getElementById('recordsDate').textContent = `${year}-${String(month + 1).padStart(2, '0')}`;
  currentDetailType = 'month';
  selectedYear = year;
  selectedMonth = month;
  if (resetSort !== false) {
    sortDirection = null;
    updateSortArrows();
  }
  showPlanSummary(records);
}

// 显示计划汇总
function showPlanSummary(records) {
  const tbody = document.getElementById('historyTable');
  const emptyEl = document.getElementById('emptyHistory');
  const pm = {};
  records.forEach(r => {
    if (!r.result) return;
    if (!pm[r.planName]) pm[r.planName] = { invested: 0, returned: 0, profit: 0, count: 0 };
    pm[r.planName].invested += r.betAmount;
    pm[r.planName].returned += r.winAmount;
    pm[r.planName].profit += r.profit;
    pm[r.planName].count++;
  });

  let entries = Object.entries(pm);
  if (entries.length === 0) { tbody.innerHTML = ''; emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';

  if (sortDirection === 'desc') entries.sort((a, b) => b[1].profit - a[1].profit);
  else if (sortDirection === 'asc') entries.sort((a, b) => a[1].profit - b[1].profit);

  tbody.innerHTML = entries.map(([n, d]) => `
    <tr><td>${n}</td><td>${d.invested.toFixed(0)}</td><td>${d.count}条</td>
    <td class="${d.profit > 0 ? 'win' : d.profit < 0 ? 'lose' : ''}">${d.profit.toFixed(0)}</td></tr>
  `).join('');
}

// 显示某天的投注记录
function showRecordsForDate(dateStr) {
  selectedDate = dateStr;
  const records = historyData.allRecords.filter(r => r.date === dateStr);
  currentDetailType = 'day';
  selectedYear = null;
  selectedMonth = null;
  sortDirection = null;
  updateSortArrows();

  const [y, m, d] = dateStr.split('-');
  document.getElementById('recordsDate').textContent = `${y}-${m}-${d}`;
  renderRecordsTable(records);
}

// 渲染记录表格
function renderRecordsTable(records) {
  const tbody = document.getElementById('historyTable');
  const emptyEl = document.getElementById('emptyHistory');
  if (records.length === 0) { tbody.innerHTML = ''; emptyEl.style.display = 'none'; return; }
  emptyEl.style.display = 'none';

  const sorted = [...records];
  if (sortDirection === 'desc') sorted.sort((a, b) => (b.profit || 0) - (a.profit || 0));
  else if (sortDirection === 'asc') sorted.sort((a, b) => (a.profit || 0) - (b.profit || 0));

  tbody.innerHTML = sorted.map(r => `
    <tr><td>${r.planName}</td><td>${r.betAmount.toFixed(0)}</td>
    <td class="${r.result === 'win' ? 'win' : r.result === 'lose' ? 'lose' : ''}">${r.result === 'win' ? '中' : r.result === 'lose' ? '未中' : '-'}</td>
    <td class="${r.profit > 0 ? 'win' : r.profit < 0 ? 'lose' : ''}">${r.result ? r.profit.toFixed(0) : '-'}</td></tr>
  `).join('');
}

// 切换盈亏排序
function toggleSortByProfit() {
  if (sortDirection === null) sortDirection = 'desc';
  else if (sortDirection === 'desc') sortDirection = 'asc';
  else sortDirection = null;
  updateSortArrows();
  refreshCurrentDetail();
}

// 刷新当前明细
function refreshCurrentDetail() {
  if (currentDetailType === 'day' && selectedDate) {
    renderRecordsTable(historyData.allRecords.filter(r => r.date === selectedDate));
  } else if (currentDetailType === 'month' && selectedYear !== null && selectedMonth !== null) {
    showMonthSummary(selectedYear, selectedMonth, false);
  } else if (currentDetailType === 'year' && selectedYear !== null) {
    showYearSummary(selectedYear, false);
  }
}

// 更新排序箭头
function updateSortArrows() {
  document.getElementById('sortArrowDesc').classList.toggle('active', sortDirection === 'desc');
  document.getElementById('sortArrowAsc').classList.toggle('active', sortDirection === 'asc');
}

// 辅助
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
