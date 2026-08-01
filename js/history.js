let historyData = null;
let currentCalendarView = 'day';
let currentGroupBy = 'day';
let currentRange = '1m';
let currentDate = new Date();
let profitChart = null;
let sortColumn = null; // null=默认, 'invested', 'profit', 'streak', 'mom'
let sortDirection = null; // 'asc' or 'desc'
let selectedDate = null;
let currentDetailType = 'day';
let selectedYear = null;
let selectedMonth = null;
// 缓存计划汇总数据，避免重排序时重复计算
let cachedPlanEntries = null;
let cachedStreaks = null;
let cachedMoms = null;
let cachedIsMonthView = false;

// 每种分组下的时间范围选项及默认值
const RANGE_OPTIONS = {
  day:   [{ label: '近1月', value: '1m' }, { label: '近3月', value: '3m' }, { label: '近6月', value: '6m' }, { label: '近1年', value: '1y' }, { label: '全部', value: 'all' }],
  week:  [{ label: '近3月', value: '3m' }, { label: '近6月', value: '6m' }, { label: '近1年', value: '1y' }, { label: '近2年', value: '2y' }, { label: '全部', value: 'all' }],
  month: [{ label: '近1年', value: '1y' }, { label: '近2年', value: '2y' }, { label: '近3年', value: '3y' }, { label: '近5年', value: '5y' }, { label: '全部', value: 'all' }]
};
const RANGE_DEFAULTS = { day: '1m', week: '3m', month: '1y' };

// 页面加载
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();

  // 检查登录状态
  if (!(await requireAuth())) return;

  loadHistory();
});

// 加载历史数据
async function loadHistory() {
  try {
    historyData = await api.getHistory();
    renderRangeButtons();
    renderProfitChart();
    renderCalendar();
    // 默认展示昨天的记录
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    showRecordsForDate(formatDate(yesterday));
  } catch (error) {
    console.error('加载历史失败:', error);
  }
}

// 切换分组
function switchChartGroup(group) {
  currentGroupBy = group;
  currentRange = RANGE_DEFAULTS[group];
  renderRangeButtons();
  renderProfitChart();
}

// 切换时间范围
function switchChartRange(range) {
  currentRange = range;
  // 更新按钮高亮
  document.querySelectorAll('.chart-range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
  renderProfitChart();
}

// 渲染时间范围按钮
function renderRangeButtons() {
  const bar = document.getElementById('chartRangeBar');
  const options = RANGE_OPTIONS[currentGroupBy];
  bar.innerHTML = options.map(opt =>
    `<button class="chart-range-btn${opt.value === currentRange ? ' active' : ''}" data-range="${opt.value}" onclick="switchChartRange('${opt.value}')">${opt.label}</button>`
  ).join('');
}

// 根据范围过滤日期列表
function filterByRange(dates) {
  if (currentRange === 'all' || dates.length === 0) return dates;
  const lastDate = dates[dates.length - 1];
  const endDate = new Date(lastDate);
  let monthsBack;
  switch (currentRange) {
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
  const startStr = formatDate(startDate);
  return dates.filter(d => d >= startStr);
}

// 按周聚合
function aggregateByWeek(dailyProfits) {
  const weekMap = {};
  dailyProfits.forEach(item => {
    const d = new Date(item.date);
    // ISO 周：计算该日期所在周的周一
    const dayOfWeek = d.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const weekKey = formatDate(monday);
    if (!weekMap[weekKey]) weekMap[weekKey] = { date: weekKey, cumulative: 0, profit: 0 };
    weekMap[weekKey].cumulative = item.cumulative; // 用最后一天的累计值
    weekMap[weekKey].profit += item.profit;
  });
  return Object.values(weekMap).sort((a, b) => a.date.localeCompare(b.date));
}

// 按月聚合
function aggregateByMonth(dailyProfits) {
  const monthMap = {};
  dailyProfits.forEach(item => {
    const monthKey = item.date.substring(0, 7);
    if (!monthMap[monthKey]) monthMap[monthKey] = { date: monthKey, cumulative: 0, profit: 0 };
    monthMap[monthKey].cumulative = item.cumulative;
    monthMap[monthKey].profit += item.profit;
  });
  return Object.values(monthMap).sort((a, b) => a.date.localeCompare(b.date));
}

// 渲染折线图
function renderProfitChart() {
  const ctx = document.getElementById('profitChart').getContext('2d');
  if (profitChart) profitChart.destroy();
  if (!historyData.dailyProfits || historyData.dailyProfits.length === 0) return;

  let points = [];

  if (currentGroupBy === 'day') {
    points = historyData.dailyProfits.map(i => ({ label: i.date, value: i.cumulative }));
  } else if (currentGroupBy === 'week') {
    const weeks = aggregateByWeek(historyData.dailyProfits);
    points = weeks.map(w => ({ label: w.date, value: w.cumulative }));
  } else {
    const months = aggregateByMonth(historyData.dailyProfits);
    points = months.map(m => ({ label: m.date, value: m.cumulative }));
  }

  // 按范围过滤
  const allLabels = points.map(p => p.label);
  const filteredLabels = filterByRange(allLabels);
  const filteredPoints = points.filter(p => filteredLabels.includes(p.label));

  if (filteredPoints.length === 0) return;

  const labels = filteredPoints.map(p => p.label);
  const data = filteredPoints.map(p => p.value);

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
        x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { maxTicksLimit: 6, color: '#6b7280', font: { size: 11 } } },
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
    sortColumn = null;
    sortDirection = null;
  }
  showPlanSummary(records);
}

// 显示某月按计划汇总
function showMonthSummary(year, month, resetSort) {
  const ms = `${year}-${String(month + 1).padStart(2, '0')}`;
  const records = historyData.allRecords.filter(r => r.date.startsWith(ms));

  // 获取上月记录（用于连黑跨月追溯和环比）
  const prevDate = new Date(year, month, 0); // 上月最后一天
  const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevRecords = historyData.allRecords.filter(r => r.date.startsWith(prevYM));

  document.getElementById('recordsDate').textContent = `${year}-${String(month + 1).padStart(2, '0')}`;
  currentDetailType = 'month';
  selectedYear = year;
  selectedMonth = month;
  if (resetSort !== false) {
    sortColumn = null;
    sortDirection = null;
  }
  showPlanSummary(records, prevRecords);
}

// 计算某计划在指定月份的最大连黑数
// 规则：跨月连黑、同天多条按时间序、休息日不断连黑
function calcMaxLoseStreak(curRecords, prevRecords) {
  // 合并上月和本月记录，按日期排序
  const allRecords = [...prevRecords, ...curRecords].sort((a, b) => a.date.localeCompare(b.date) || 0);

  // 按日期分组，每天的结果：有 win → 该天不算连黑（连黑断裂），全 lose → 该天算连黑
  const dayResults = {};
  allRecords.forEach(r => {
    if (!r.result) return; // 跳过未结算
    if (!dayResults[r.date]) dayResults[r.date] = [];
    dayResults[r.date].push(r.result);
  });

  const dates = Object.keys(dayResults).sort();
  if (dates.length === 0) return 0;

  // 只关注本月范围内的连黑（但连黑可以从前月延续）
  const curMonthStart = curRecords.length > 0 ? curRecords[0].date.substring(0, 7) : '';

  let streak = 0;
  let maxStreak = 0;

  for (const date of dates) {
    const results = dayResults[date];
    const allLose = results.every(r => r === 'lose');

    if (allLose) {
      streak++;
      // 只在本月范围内更新 maxStreak
      if (curMonthStart && date.startsWith(curMonthStart)) {
        maxStreak = Math.max(maxStreak, streak);
      }
    } else {
      // 有任意 win，连黑断裂
      streak = 0;
    }
  }

  return maxStreak;
}

// 计算环比
function calcMoM(curProfit, prevProfit) {
  if (prevProfit === 0 && curProfit === 0) return null;
  if (prevProfit === 0) return null; // 上月无数据，无法计算环比
  return ((curProfit - prevProfit) / Math.abs(prevProfit)) * 100;
}

// 生成排序箭头HTML
function sortArrowHtml(column) {
  const isActive = sortColumn === column;
  const upClass = isActive && sortDirection === 'asc' ? ' active' : '';
  const downClass = isActive && sortDirection === 'desc' ? ' active' : '';
  return `<span class="sort-arrows"><span class="sort-arrow${upClass}" onclick="toggleSort('${column}','asc')">▲</span><span class="sort-arrow${downClass}" onclick="toggleSort('${column}','desc')">▼</span></span>`;
}

// 显示计划汇总（首次计算数据 + 渲染）
function showPlanSummary(records, prevRecords) {
  const isMonthView = currentDetailType === 'month';

  const pm = {};
  records.forEach(r => {
    if (!r.result) return;
    if (!pm[r.planName]) pm[r.planName] = { invested: 0, returned: 0, profit: 0, count: 0 };
    pm[r.planName].invested += r.betAmount;
    pm[r.planName].returned += r.winAmount;
    pm[r.planName].profit += r.profit;
    pm[r.planName].count++;
  });

  cachedPlanEntries = Object.entries(pm);
  cachedIsMonthView = isMonthView;

  // 月份视图下计算上月各计划利润 + 连黑 + 环比
  let prevPlanProfits = {};
  cachedStreaks = {};
  cachedMoms = {};
  if (isMonthView) {
    if (prevRecords) {
      prevRecords.forEach(r => {
        if (!r.result) return;
        if (!prevPlanProfits[r.planName]) prevPlanProfits[r.planName] = 0;
        prevPlanProfits[r.planName] += r.profit;
      });
    }
    cachedPlanEntries.forEach(([n, d]) => {
      const curPlanRecords = records.filter(r => r.planName === n && r.result);
      const prevPlanRecords = (prevRecords || []).filter(r => r.planName === n && r.result);
      cachedStreaks[n] = calcMaxLoseStreak(curPlanRecords, prevPlanRecords);
      const prevProfit = prevPlanProfits[n] || 0;
      cachedMoms[n] = calcMoM(d.profit, prevProfit);
    });
  }

  renderPlanSummaryTableBody();
}

// 仅重排序+重渲染表头和表格体（排序切换时调用）
function renderPlanSummaryTableBody() {
  const tbody = document.getElementById('historyTable');
  const thead = document.getElementById('historyTableHead');
  const emptyEl = document.getElementById('emptyHistory');
  if (!cachedPlanEntries) return;
  if (cachedPlanEntries.length === 0) { tbody.innerHTML = ''; thead.innerHTML = ''; emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';

  // 动态设置表头（含排序箭头）
  if (cachedIsMonthView) {
    thead.innerHTML = `<tr><th>计划</th><th>投注${sortArrowHtml('invested')}</th><th>结果</th><th>净利润${sortArrowHtml('profit')}</th><th>最大连黑${sortArrowHtml('streak')}</th><th>环比${sortArrowHtml('mom')}</th></tr>`;
  } else {
    thead.innerHTML = `<tr><th>计划</th><th>投注${sortArrowHtml('invested')}</th><th>结果</th><th>净利润${sortArrowHtml('profit')}</th></tr>`;
  }

  let entries = [...cachedPlanEntries];

  // 按当前排序列排序
  if (sortColumn && sortDirection) {
    entries.sort((a, b) => {
      let va, vb;
      if (sortColumn === 'invested') { va = a[1].invested; vb = b[1].invested; }
      else if (sortColumn === 'profit') { va = a[1].profit; vb = b[1].profit; }
      else if (sortColumn === 'streak') { va = cachedStreaks[a[0]] || 0; vb = cachedStreaks[b[0]] || 0; }
      else if (sortColumn === 'mom') { va = cachedMoms[a[0]] != null ? cachedMoms[a[0]] : -Infinity; vb = cachedMoms[b[0]] != null ? cachedMoms[b[0]] : -Infinity; }
      else { return 0; }
      return sortDirection === 'asc' ? va - vb : vb - va;
    });
  }

  tbody.innerHTML = entries.map(([n, d]) => {
    let extra = '';
    if (cachedIsMonthView) {
      const streak = cachedStreaks[n] || 0;
      const streakHtml = streak > 0 ? `<span style="color:#ef4444;font-weight:600;">${streak}</span>` : '<span style="color:var(--text-muted);">0</span>';

      const mom = cachedMoms[n];
      let momHtml = '<span style="color:var(--text-muted);">-</span>';
      if (mom !== null) {
        const momClass = mom >= 0 ? 'win' : 'lose';
        const momPrefix = mom >= 0 ? '+' : '';
        momHtml = `<span class="${momClass}">${momPrefix}${mom.toFixed(1)}%</span>`;
      }

      extra = `<td>${streakHtml}</td><td>${momHtml}</td>`;
    }

    return `<tr><td>${n}</td><td>${d.invested.toFixed(0)}</td><td>${d.count}条</td>
    <td class="${d.profit > 0 ? 'win' : d.profit < 0 ? 'lose' : ''}">${d.profit.toFixed(0)}</td>${extra}</tr>`;
  }).join('');
}

// 显示某天的投注记录
function showRecordsForDate(dateStr) {
  selectedDate = dateStr;
  const records = historyData.allRecords.filter(r => r.date === dateStr);
  currentDetailType = 'day';
  selectedYear = null;
  selectedMonth = null;
  sortColumn = null;
  sortDirection = null;

  const [y, m, d] = dateStr.split('-');
  document.getElementById('recordsDate').textContent = `${y}-${m}-${d}`;
  renderRecordsTable(records);
}

// 渲染记录表格
function renderRecordsTable(records) {
  const tbody = document.getElementById('historyTable');
  const thead = document.getElementById('historyTableHead');
  const emptyEl = document.getElementById('emptyHistory');
  if (records.length === 0) { tbody.innerHTML = ''; thead.innerHTML = ''; emptyEl.style.display = 'none'; return; }
  emptyEl.style.display = 'none';

  thead.innerHTML = `<tr><th>计划</th><th>投注${sortArrowHtml('invested')}</th><th>结果</th><th>净利润${sortArrowHtml('profit')}</th></tr>`;

  const sorted = [...records];
  if (sortColumn && sortDirection) {
    sorted.sort((a, b) => {
      let va, vb;
      if (sortColumn === 'invested') { va = a.betAmount; vb = b.betAmount; }
      else if (sortColumn === 'profit') { va = a.profit || 0; vb = b.profit || 0; }
      else return 0;
      return sortDirection === 'asc' ? va - vb : vb - va;
    });
  }

  tbody.innerHTML = sorted.map(r => `
    <tr><td>${r.planName}</td><td>${r.betAmount.toFixed(0)}</td>
    <td class="${r.result === 'win' ? 'win' : r.result === 'lose' ? 'lose' : ''}">${r.result === 'win' ? '中' : r.result === 'lose' ? '未中' : '-'}</td>
    <td class="${r.profit > 0 ? 'win' : r.profit < 0 ? 'lose' : ''}">${r.result ? r.profit.toFixed(0) : '-'}</td></tr>
  `).join('');
}

// 切换排序（单列排序：点击同列切换方向，点击不同列切换列）
function toggleSort(column, direction) {
  if (sortColumn === column && sortDirection === direction) {
    sortColumn = null;
    sortDirection = null;
  } else {
    sortColumn = column;
    sortDirection = direction;
  }
  // 直接重绘，避免嵌套调用
  if (currentDetailType === 'day' && selectedDate) {
    renderRecordsTable(historyData.allRecords.filter(r => r.date === selectedDate));
  } else {
    renderPlanSummaryTableBody();
  }
}

// 刷新当前明细
function refreshCurrentDetail() {
  if (currentDetailType === 'day' && selectedDate) {
    renderRecordsTable(historyData.allRecords.filter(r => r.date === selectedDate));
  } else {
    renderPlanSummaryTableBody();
  }
}


// 辅助
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
