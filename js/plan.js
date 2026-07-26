let currentPlan = null;
let selectedResult = null;
let planProfitChart = null;
let planChartView = 'day';
let planCalendarView = 'day';
let planCalendarDate = new Date();

// 从URL获取计划ID
function getPlanId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// 页面加载
document.addEventListener('DOMContentLoaded', async () => {
  console.log('plan.html 页面加载');
  console.log('完整URL:', window.location.href);
  console.log('Search:', window.location.search);

  const planId = getPlanId();
  console.log('planId:', planId);

  if (!planId) {
    console.log('没有planId，停止执行（不跳转）');
    return;
  }

  try {
    await loadPlan(planId);
  } catch (e) {
    console.error('加载出错:', e);
  }

  document.getElementById('recordDate').valueAsDate = new Date();
});

// 加载计划
async function loadPlan(planId) {
  console.log('loadPlan 被调用, planId:', planId);

  // 等待 Supabase SDK 加载
  await waitForSupabase();
  console.log('Supabase 已加载');

  console.log('开始获取计划数据...');
  currentPlan = await api.getPlan(planId);
  console.log('计划数据:', currentPlan);

  renderPlanInfo();
  console.log('renderPlanInfo 完成');

  renderRecords();
  console.log('renderRecords 完成');

  updateRecommendation();
  console.log('updateRecommendation 完成');

  renderPlanProfitChart();
  console.log('renderPlanProfitChart 完成');

  renderPlanCalendar();
  console.log('renderPlanCalendar 完成');
}

// 渲染计划信息
function renderPlanInfo() {
  document.getElementById('planName').textContent = currentPlan.name;

  const typeEl = document.getElementById('planType');
  typeEl.textContent = currentPlan.type === 'martingale' ? '加注' : '普通';
  typeEl.className = `plan-type ${currentPlan.type === 'martingale' ? 'martingale' : ''}`;

  const statusEl = document.getElementById('planStatus');
  statusEl.textContent = currentPlan.status === 'active' ? '进行中' : '已暂停';
  statusEl.className = `plan-status ${currentPlan.status}`;

  const toggleBtn = document.getElementById('toggleStatusBtn');
  toggleBtn.textContent = currentPlan.status === 'active' ? '暂停' : '恢复';
  toggleBtn.className = `btn btn-sm ${currentPlan.status === 'active' ? 'btn-warning' : 'btn-success'}`;

  if (currentPlan.type === 'martingale' && currentPlan.initialAmount) {
    document.getElementById('initialAmountInfo').style.display = 'block';
    document.getElementById('initialAmount').textContent = `¥${currentPlan.initialAmount.toFixed(2)}`;
  }
}

// 渲染记录表格（按月分组）
function renderRecords() {
  const tbody = document.getElementById('recordsTable');
  const emptyEl = document.getElementById('emptyRecords');

  if (currentPlan.records.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  // 按日期倒序显示
  const sortedRecords = [...currentPlan.records].reverse();

  // 按月份分组
  const groups = {};
  sortedRecords.forEach(record => {
    const month = record.date.substring(0, 7);
    if (!groups[month]) groups[month] = [];
    groups[month].push(record);
  });

  // 当前月份
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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

    html += `
      <tr id="plan-header-${month}" class="month-group-header ${isCurrentMonth ? 'expanded' : ''}" onclick="togglePlanMonthGroup('${month}')">
        <td colspan="6">
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

    monthRecords.forEach(record => {
      const hiddenClass = isCurrentMonth ? '' : 'hidden';
      html += `
        <tr class="month-row plan-group-${month} ${hiddenClass}">
          <td>${record.date}</td>
          <td>¥${record.betAmount.toFixed(2)}</td>
          <td class="${record.result === 'win' ? 'win' : record.result === 'lose' ? 'lose' : ''}">
            ${record.result === 'win' ? '中' : record.result === 'lose' ? '未中' : '未结算'}
          </td>
          <td>${record.winAmount > 0 ? `¥${record.winAmount.toFixed(2)}` : '-'}</td>
          <td class="${record.profit > 0 ? 'win' : record.profit < 0 ? 'lose' : ''}">
            ${record.result ? `¥${record.profit.toFixed(2)}` : '-'}
          </td>
          <td>
            ${!record.result ? `
              <button class="btn btn-sm" onclick="showEditAmountModal('${record.id}', ${record.betAmount})">修改金额</button>
              <button class="btn btn-sm btn-primary" onclick="showResultModal('${record.id}')">填写结果</button>
            ` : `
              <button class="btn btn-sm" onclick="showResultModal('${record.id}')">修改结果</button>
            `}
          </td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html;
}

// 切换计划月份折叠
function togglePlanMonthGroup(month) {
  const header = document.getElementById(`plan-header-${month}`);
  const rows = document.querySelectorAll(`.plan-group-${month}`);

  header.classList.toggle('expanded');
  rows.forEach(row => row.classList.toggle('hidden'));
}

// 更新推荐金额
function updateRecommendation() {
  if (currentPlan.type !== 'martingale') {
    document.getElementById('recommendation').style.display = 'none';
    return;
  }

  const recommendationEl = document.getElementById('recommendation');
  const lastRecord = currentPlan.records[currentPlan.records.length - 1];

  if (!lastRecord || lastRecord.result === 'win' || !lastRecord.result) {
    const recommendedAmount = currentPlan.initialAmount;
    recommendationEl.innerHTML = `
      <strong>推荐投注:</strong> ¥${recommendedAmount.toFixed(2)} (初始本金 × 1)
    `;
    recommendationEl.style.display = 'block';
  } else {
    // 计算连续未中次数
    let consecutiveLosses = 0;
    for (let i = currentPlan.records.length - 1; i >= 0; i--) {
      if (currentPlan.records[i].result === 'lose') {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    const multipliers = [1, 2, 3, 5, 8, 12, 18, 28, 46, 74];
    const nextMultiplier = multipliers[Math.min(consecutiveLosses, multipliers.length - 1)];
    const recommendedAmount = currentPlan.initialAmount * nextMultiplier;

    recommendationEl.innerHTML = `
      <strong>推荐投注:</strong> ¥${recommendedAmount.toFixed(2)} (初始本金 × ${nextMultiplier})
      <br><small>已连续 ${consecutiveLosses} 次未中</small>
    `;
    recommendationEl.style.display = 'block';
  }
}

// 添加投注记录
document.getElementById('addRecordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const date = document.getElementById('recordDate').value;
  const betAmount = document.getElementById('betAmount').value;

  try {
    await api.addRecord(currentPlan.id, { date, betAmount: Number(betAmount) });
    loadPlan(currentPlan.id);
    document.getElementById('betAmount').value = '';
  } catch (error) {
    alert(error.message);
  }
});

// 显示结果弹窗
function showResultModal(recordId) {
  document.getElementById('resultDate').value = recordId;
  document.getElementById('winAmountGroup').style.display = 'none';
  document.getElementById('winAmount').value = '';
  selectedResult = null;
  document.getElementById('resultModal').classList.add('show');
}

// 隐藏结果弹窗
function hideResultModal() {
  document.getElementById('resultModal').classList.remove('show');
}

// 选择结果
function selectResult(result) {
  selectedResult = result;
  document.getElementById('winAmountGroup').style.display = result === 'win' ? 'block' : 'none';

  // 更新按钮样式
  const winBtn = document.querySelector('#resultForm .btn-success');
  const loseBtn = document.querySelector('#resultForm .btn-danger');

  winBtn.classList.toggle('selected', result === 'win');
  loseBtn.classList.toggle('selected', result === 'lose');
}

// 提交结果
document.getElementById('resultForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedResult) {
    alert('请选择投注结果');
    return;
  }

  const recordId = document.getElementById('resultDate').value;
  const winAmount = selectedResult === 'win' ? Number(document.getElementById('winAmount').value) : 0;

  if (selectedResult === 'win' && !winAmount) {
    alert('请填写中奖金额');
    return;
  }

  try {
    await api.updateRecord(currentPlan.id, recordId, {
      result: selectedResult,
      winAmount,
    });
    hideResultModal();
    loadPlan(currentPlan.id);
  } catch (error) {
    alert(error.message);
  }
});

// 暂停/恢复计划
async function toggleStatus() {
  try {
    await api.updatePlanStatus(currentPlan.id);
    loadPlan(currentPlan.id);
  } catch (error) {
    alert(error.message);
  }
}

// 显示修改金额弹窗
function showEditAmountModal(recordId, betAmount) {
  document.getElementById('editAmountDate').value = recordId;
  document.getElementById('newBetAmount').value = betAmount;
  document.getElementById('editAmountModal').classList.add('show');
}

// 隐藏修改金额弹窗
function hideEditAmountModal() {
  document.getElementById('editAmountModal').classList.remove('show');
}

// 提交修改金额
document.getElementById('editAmountForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const recordId = document.getElementById('editAmountDate').value;
  const betAmount = document.getElementById('newBetAmount').value;

  try {
    await api.updateRecord(currentPlan.id, recordId, { betAmount: Number(betAmount) });
    hideEditAmountModal();
    loadPlan(currentPlan.id);
  } catch (error) {
    alert(error.message);
  }
});

// ========== 图表相关 ==========

// 获取计划的收益数据
function getPlanDailyProfits() {
  if (!currentPlan || !currentPlan.records) return [];

  // 按日期排序（正序）
  const sorted = [...currentPlan.records].sort((a, b) => a.date.localeCompare(b.date));

  // 构建每日收益
  const dailyMap = {};
  sorted.forEach(record => {
    if (!dailyMap[record.date]) {
      dailyMap[record.date] = { profit: 0, settled: false };
    }
    if (record.result) {
      dailyMap[record.date].profit += record.profit;
      dailyMap[record.date].settled = true;
    }
  });

  // 只保留已结算的日期，计算累计
  let cumulative = 0;
  const result = [];
  Object.keys(dailyMap).sort().forEach(date => {
    if (dailyMap[date].settled) {
      cumulative += dailyMap[date].profit;
      result.push({ date, profit: dailyMap[date].profit, cumulative });
    }
  });

  return result;
}

// 渲染计划收益趋势图
function renderPlanProfitChart() {
  const ctx = document.getElementById('planProfitChart');
  if (!ctx) return;

  if (planProfitChart) {
    planProfitChart.destroy();
  }

  const dailyProfits = getPlanDailyProfits();
  if (dailyProfits.length === 0) return;

  let labels = [], data = [];

  if (planChartView === 'day') {
    labels = dailyProfits.map(item => item.date);
    data = dailyProfits.map(item => item.cumulative);
  } else {
    // 月视图
    const monthMap = {};
    dailyProfits.forEach(item => {
      const month = item.date.substring(0, 7);
      monthMap[month] = item.cumulative;
    });
    const months = Object.keys(monthMap).sort();
    labels = months;
    data = months.map(m => monthMap[m]);
  }

  planProfitChart = new Chart(ctx.getContext('2d'), {
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
        legend: { display: false },
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
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { maxTicksLimit: 10, color: '#6b7280' }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            callback: (value) => `¥${value}`,
            color: '#6b7280',
          }
        }
      }
    }
  });
}

// 切换计划图表视图
function switchPlanChartView(view) {
  document.querySelectorAll('#planProfitChart').forEach(el => {
    el.parentElement.querySelectorAll('.chart-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.textContent === (view === 'day' ? '日' : '月')) {
        tab.classList.add('active');
      }
    });
  });
  planChartView = view;
  renderPlanProfitChart();
}

// 构建计划日期到收益的映射
function buildPlanProfitMap() {
  const profitMap = {};
  if (currentPlan && currentPlan.records) {
    currentPlan.records.forEach(record => {
      if (record.result) {
        if (!profitMap[record.date]) profitMap[record.date] = 0;
        profitMap[record.date] += record.profit;
      }
    });
  }
  return profitMap;
}

// 渲染计划日历
function renderPlanCalendar() {
  const container = document.getElementById('planCalendarContainer');
  const titleEl = document.getElementById('planCalendarTitle');
  const profitMap = buildPlanProfitMap();

  if (planCalendarView === 'year') {
    renderPlanYearCalendar(container, titleEl, profitMap);
  } else if (planCalendarView === 'week') {
    renderPlanWeekCalendar(container, titleEl, profitMap);
  } else {
    renderPlanDayCalendar(container, titleEl, profitMap);
  }
}

// 计划年视图
function renderPlanYearCalendar(container, titleEl, profitMap) {
  const year = planCalendarDate.getFullYear();
  titleEl.textContent = `${year}年`;

  let html = '<div class="year-grid">';
  for (let month = 0; month < 12; month++) {
    let monthProfit = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (profitMap[dateStr]) monthProfit += profitMap[dateStr];
    }
    const profitClass = monthProfit > 0 ? 'positive' : monthProfit < 0 ? 'negative' : '';
    const profitText = monthProfit !== 0 ? `${monthProfit > 0 ? '+' : ''}${monthProfit.toFixed(0)}` : '-';
    const boxClass = monthProfit > 0 ? 'profit-up' : monthProfit < 0 ? 'profit-down' : '';

    html += `
      <div class="year-month-box ${boxClass}" onclick="jumpPlanToMonth(${year}, ${month})">
        <div class="month-name">${month + 1}月</div>
        <div class="month-profit ${profitClass}">${profitText}</div>
      </div>
    `;
  }
  html += '</div>';
  container.innerHTML = html;
}

// 计划跳转月份
function jumpPlanToMonth(year, month) {
  planCalendarDate = new Date(year, month, 1);
  planCalendarView = 'day';
  updatePlanCalendarTabs('日');
  renderPlanCalendar();
}

// 计划周视图
function renderPlanWeekCalendar(container, titleEl, profitMap) {
  const current = new Date(planCalendarDate);
  const dayOfWeek = current.getDay();
  const currentWeekStart = new Date(current);
  currentWeekStart.setDate(current.getDate() - dayOfWeek);

  const startDate = new Date(currentWeekStart);
  startDate.setDate(startDate.getDate() - 7 * 15);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7 * 30 - 1);

  titleEl.textContent = `${formatPlanDate(startDate)} ~ ${formatPlanDate(endDate)}`;

  let html = '<div class="week-grid">';
  for (let w = 0; w < 30; w++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + w * 7);

    let weekProfit = 0;
    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      const dateStr = formatPlanDate(date);
      if (profitMap[dateStr]) weekProfit += profitMap[dateStr];
    }

    const profitClass = weekProfit > 0 ? 'positive' : weekProfit < 0 ? 'negative' : '';
    const profitText = weekProfit !== 0 ? `${weekProfit > 0 ? '+' : ''}${weekProfit.toFixed(0)}` : '-';
    const boxClass = weekProfit > 0 ? 'profit-up' : weekProfit < 0 ? 'profit-down' : '';

    html += `
      <div class="week-box ${boxClass}" onclick="jumpPlanToWeek('${formatPlanDate(weekStart)}')">
        <div class="week-range">${weekStart.getMonth() + 1}/${weekStart.getDate()}</div>
        <div class="week-profit ${profitClass}">${profitText}</div>
      </div>
    `;
  }
  html += '</div>';
  container.innerHTML = html;
}

// 计划跳转周
function jumpPlanToWeek(dateStr) {
  planCalendarDate = new Date(dateStr);
  planCalendarView = 'day';
  updatePlanCalendarTabs('日');
  renderPlanCalendar();
}

// 计划日视图
function renderPlanDayCalendar(container, titleEl, profitMap) {
  const year = planCalendarDate.getFullYear();
  const month = planCalendarDate.getMonth();

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

  for (let i = 0; i < startDay; i++) {
    html += '<div class="day-cell empty"></div>';
  }

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

// 计划日历导航
function navigatePlanCalendar(direction) {
  if (planCalendarView === 'year') {
    planCalendarDate.setFullYear(planCalendarDate.getFullYear() + direction);
  } else if (planCalendarView === 'week') {
    planCalendarDate.setDate(planCalendarDate.getDate() + direction * 7 * 30);
  } else {
    planCalendarDate.setMonth(planCalendarDate.getMonth() + direction);
  }
  renderPlanCalendar();
}

// 切换计划日历视图
function switchPlanCalendarView(view) {
  planCalendarView = view;
  updatePlanCalendarTabs(view === 'day' ? '日' : view === 'week' ? '周' : '年');
  renderPlanCalendar();
}

// 更新日历标签状态
function updatePlanCalendarTabs(activeText) {
  document.querySelectorAll('#planCalendarContainer').forEach(el => {
    el.closest('.chart-container').querySelectorAll('.chart-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.textContent === activeText) tab.classList.add('active');
    });
  });
}

// 辅助函数
function formatPlanDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
