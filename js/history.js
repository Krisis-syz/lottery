let historyData = null;
let currentCalendarView = 'day';
let currentChartView = 'day';
let currentDate = new Date();
let profitChart = null;

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
    renderHistoryTable();
  } catch (error) {
    console.error('加载历史失败:', error);
  }
}

// 切换图表视图
function switchChartView(view) {
  currentChartView = view;
  document.querySelectorAll('.chart-header .chart-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.textContent === (view === 'day' ? '日' : view === 'month' ? '月' : '年')) {
      tab.classList.add('active');
    }
  });
  renderProfitChart();
}

// 渲染折线图
function renderProfitChart() {
  const ctx = document.getElementById('profitChart').getContext('2d');

  if (profitChart) {
    profitChart.destroy();
  }

  if (!historyData.dailyProfits || historyData.dailyProfits.length === 0) {
    return;
  }

  // 根据视图类型聚合数据
  let labels = [];
  let data = [];

  if (currentChartView === 'day') {
    labels = historyData.dailyProfits.map(item => item.date);
    data = historyData.dailyProfits.map(item => item.cumulative);
  } else if (currentChartView === 'month') {
    const monthMap = {};
    historyData.dailyProfits.forEach(item => {
      const month = item.date.substring(0, 7);
      monthMap[month] = item.cumulative;
    });
    const months = Object.keys(monthMap).sort();
    labels = months;
    data = months.map(m => monthMap[m]);
  } else {
    const yearMap = {};
    historyData.dailyProfits.forEach(item => {
      const year = item.date.substring(0, 4);
      yearMap[year] = item.cumulative;
    });
    const years = Object.keys(yearMap).sort();
    labels = years;
    data = years.map(y => yearMap[y]);
  }

  profitChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '累计净收益',
        data,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#0a0e17',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.9)',
          titleColor: '#f9fafb',
          bodyColor: '#f59e0b',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => `¥${context.parsed.y.toFixed(2)}`,
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
          ticks: {
            maxTicksLimit: 10,
            color: '#6b7280',
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
          ticks: {
            callback: (value) => `¥${value}`,
            color: '#6b7280',
          }
        }
      }
    }
  });
}

// 切换日历视图
function switchCalendarView(view) {
  currentCalendarView = view;
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.textContent === (view === 'day' ? '日' : view === 'week' ? '周' : '年')) {
      tab.classList.add('active');
    }
  });
  renderCalendar();
}

// 导航日历
function navigateCalendar(direction) {
  if (currentCalendarView === 'year') {
    currentDate.setFullYear(currentDate.getFullYear() + direction);
  } else if (currentCalendarView === 'week') {
    currentDate.setDate(currentDate.getDate() + direction * 7 * 30);
  } else {
    currentDate.setMonth(currentDate.getMonth() + direction);
  }
  renderCalendar();
}

// 构建日期到收益的映射
function buildProfitMap() {
  const profitMap = {};
  if (historyData && historyData.dailyProfits) {
    historyData.dailyProfits.forEach(item => {
      profitMap[item.date] = item.profit;
    });
  }
  return profitMap;
}

// 渲染日历
function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  const titleEl = document.getElementById('calendarTitle');
  const profitMap = buildProfitMap();

  if (currentCalendarView === 'year') {
    renderYearCalendar(container, titleEl, profitMap);
  } else if (currentCalendarView === 'week') {
    renderWeekCalendar(container, titleEl, profitMap);
  } else {
    renderDayCalendar(container, titleEl, profitMap);
  }
}

// 年视图：12个月份框
function renderYearCalendar(container, titleEl, profitMap) {
  const year = currentDate.getFullYear();
  titleEl.textContent = `${year}年`;

  let html = '<div class="year-grid">';

  for (let month = 0; month < 12; month++) {
    // 计算该月总收益
    let monthProfit = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (profitMap[dateStr]) {
        monthProfit += profitMap[dateStr];
      }
    }

    const profitClass = monthProfit > 0 ? 'positive' : monthProfit < 0 ? 'negative' : '';
    const profitText = monthProfit !== 0 ? `${monthProfit > 0 ? '+' : ''}${monthProfit.toFixed(0)}` : '-';

    const boxClass = monthProfit > 0 ? 'profit-up' : monthProfit < 0 ? 'profit-down' : '';

    html += `
      <div class="year-month-box ${boxClass}" onclick="jumpToMonth(${year}, ${month})">
        <div class="month-name">${month + 1}月</div>
        <div class="month-profit ${profitClass}">${profitText}</div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

// 跳转到指定月份（日视图）
function jumpToMonth(year, month) {
  currentDate = new Date(year, month, 1);
  currentCalendarView = 'day';
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.textContent === '日') tab.classList.add('active');
  });
  renderCalendar();
}

// 周视图：展示30周
function renderWeekCalendar(container, titleEl, profitMap) {
  const current = new Date(currentDate);
  const dayOfWeek = current.getDay();
  const currentWeekStart = new Date(current);
  currentWeekStart.setDate(current.getDate() - dayOfWeek);

  // 往前推15周作为起始
  const startDate = new Date(currentWeekStart);
  startDate.setDate(startDate.getDate() - 7 * 15);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7 * 30 - 1);

  titleEl.textContent = `${formatDate(startDate)} ~ ${formatDate(endDate)}`;

  let html = '<div class="week-grid">';

  for (let w = 0; w < 30; w++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // 计算该周总收益
    let weekProfit = 0;
    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      const dateStr = formatDate(date);
      if (profitMap[dateStr]) {
        weekProfit += profitMap[dateStr];
      }
    }

    const profitClass = weekProfit > 0 ? 'positive' : weekProfit < 0 ? 'negative' : '';
    const profitText = weekProfit !== 0 ? `${weekProfit > 0 ? '+' : ''}${weekProfit.toFixed(0)}` : '-';

    const boxClass = weekProfit > 0 ? 'profit-up' : weekProfit < 0 ? 'profit-down' : '';

    html += `
      <div class="week-box ${boxClass}" onclick="jumpToWeekStart('${formatDate(weekStart)}')">
        <div class="week-range">${weekStart.getMonth() + 1}/${weekStart.getDate()}</div>
        <div class="week-profit ${profitClass}">${profitText}</div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

// 跳转到某周（日视图）
function jumpToWeekStart(dateStr) {
  currentDate = new Date(dateStr);
  currentCalendarView = 'day';
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.textContent === '日') tab.classList.add('active');
  });
  renderCalendar();
}

// 日视图：展示一个月
function renderDayCalendar(container, titleEl, profitMap) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  titleEl.textContent = `${year}年${month + 1}月`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();

  let html = `
    <div class="day-grid">
      <div class="day-header">日</div>
      <div class="day-header">一</div>
      <div class="day-header">二</div>
      <div class="day-header">三</div>
      <div class="day-header">四</div>
      <div class="day-header">五</div>
      <div class="day-header">六</div>
  `;

  // 填充月初空白
  for (let i = 0; i < startDay; i++) {
    html += '<div class="day-cell empty"></div>';
  }

  // 填充日期
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const profit = profitMap[dateStr];
    const profitClass = profit > 0 ? 'positive' : profit < 0 ? 'negative' : '';
    const profitText = profit !== undefined ? `${profit > 0 ? '+' : ''}${profit.toFixed(0)}` : '';

    const cellClass = profit > 0 ? 'profit-up' : profit < 0 ? 'profit-down' : '';

    html += `
      <div class="day-cell ${cellClass}">
        <span class="day-num">${day}</span>
        <span class="day-profit ${profitClass}">${profitText}</span>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

// 渲染历史表格（按月分组）
function renderHistoryTable() {
  const tbody = document.getElementById('historyTable');
  const emptyEl = document.getElementById('emptyHistory');

  if (!historyData || !historyData.allRecords || historyData.allRecords.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  // 按日期倒序
  const records = [...historyData.allRecords].reverse();

  // 按月份分组
  const groups = {};
  records.forEach(record => {
    const month = record.date.substring(0, 7); // "2026-07"
    if (!groups[month]) groups[month] = [];
    groups[month].push(record);
  });

  // 当前月份
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 月份倒序排列
  const sortedMonths = Object.keys(groups).sort().reverse();

  let html = '';
  sortedMonths.forEach(month => {
    const monthRecords = groups[month];
    const isCurrentMonth = month === currentMonth;

    // 计算月度汇总
    let totalBet = 0, totalProfit = 0;
    monthRecords.forEach(r => {
      totalBet += r.betAmount;
      if (r.result) totalProfit += r.profit;
    });

    const [year, mon] = month.split('-');
    const profitClass = totalProfit > 0 ? 'win' : totalProfit < 0 ? 'lose' : '';

    // 月份汇总行
    html += `
      <tr id="header-${month}" class="month-group-header ${isCurrentMonth ? 'expanded' : ''}" onclick="toggleMonthGroup('${month}')">
        <td colspan="7">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="month-label">
              <span class="arrow">▶</span>
              <span>${year}年${parseInt(mon)}月</span>
            </div>
            <div class="month-stats">
              <span class="stat-item">${monthRecords.length}条</span>
              <span class="stat-item">本金 ¥${totalBet.toFixed(0)}</span>
              <span class="stat-item ${profitClass}">净收益 ¥${totalProfit.toFixed(0)}</span>
            </div>
          </div>
        </td>
      </tr>
    `;

    // 月份内容行
    monthRecords.forEach(record => {
      const hiddenClass = isCurrentMonth ? '' : 'hidden';
      html += `
        <tr class="month-row group-${month} ${hiddenClass}">
          <td>${record.date}</td>
          <td>${record.planName}</td>
          <td>${record.planType === 'martingale' ? '加注' : '普通'}</td>
          <td>¥${record.betAmount.toFixed(2)}</td>
          <td class="${record.result === 'win' ? 'win' : record.result === 'lose' ? 'lose' : ''}">
            ${record.result === 'win' ? '中' : record.result === 'lose' ? '未中' : '未结算'}
          </td>
          <td>${record.winAmount > 0 ? `¥${record.winAmount.toFixed(2)}` : '-'}</td>
          <td class="${record.profit > 0 ? 'win' : record.profit < 0 ? 'lose' : ''}">
            ${record.result ? `¥${record.profit.toFixed(2)}` : '-'}
          </td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html;
}

// 切换月份折叠
function toggleMonthGroup(month) {
  const header = document.getElementById(`header-${month}`);
  const rows = document.querySelectorAll(`.group-${month}`);

  header.classList.toggle('expanded');
  rows.forEach(row => row.classList.toggle('hidden'));
}

// 辅助函数
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayName(day) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return names[day];
}
