// 千位分隔符格式化（带正负号）
function formatNumber(n, showSign) {
  const prefix = showSign ? (n >= 0 ? '+' : '-') : '';
  return prefix + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 页面加载时获取数据
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();

  // 检查登录状态
  if (!requireAuth()) return;

  loadSummary();
  loadPlans();
});

// 加载汇总数据
async function loadSummary() {
  try {
    const summary = await api.getSummary();

    // 总利润 - 大号数字
    const profitEl = document.getElementById('totalProfit');
    profitEl.textContent = formatNumber(summary.totalProfit, true);
    profitEl.className = 'summary-big-value ' + (summary.totalProfit >= 0 ? 'positive' : 'negative');

    // 底部三列
    const lastDayProfitEl = document.getElementById('lastDayProfit');
    const lastDayInvestedEl = document.getElementById('lastDayInvested');
    const totalInvestedEl = document.getElementById('totalInvested');

    if (summary.yesterdaySummary && summary.yesterdaySummary.date) {
      const y = summary.yesterdaySummary;
      lastDayProfitEl.textContent = formatNumber(y.profit, true);
      lastDayProfitEl.className = 'summary-col-value ' + (y.profit >= 0 ? 'positive' : 'negative');
      lastDayInvestedEl.textContent = formatNumber(y.invested);
    } else {
      lastDayProfitEl.textContent = '-';
      lastDayInvestedEl.textContent = '-';
    }
    totalInvestedEl.textContent = formatNumber(summary.totalInvested);
  } catch (error) {
    console.error('加载汇总失败:', error);
  }
}

// 加载计划列表（仅进行中）
async function loadPlans() {
  try {
    const plans = await api.getPlans();
    const grid = document.getElementById('plansGrid');

    // 只显示进行中的计划
    const activePlans = plans.filter(p => p.status === 'active');

    if (activePlans.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>暂无进行中的计划</p>
          <button class="btn btn-primary" onclick="showCreateModal()">创建新计划</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = activePlans.map(plan => {
      const href = `plan.html?id=${plan.id}`;
      const profitClass = plan.totalProfit >= 0 ? 'positive' : 'negative';
      const lastDayProfitClass = plan.yesterdayProfit >= 0 ? 'positive' : 'negative';

      return `
        <div class="plan-card-compact" onclick="window.location.assign('${href}')">
          <div class="plan-compact-top">
            <span class="plan-compact-name">${plan.name}</span>
          </div>
          <div class="plan-compact-profit">
            <span class="plan-compact-label">总利润(元)</span>
            <div class="plan-compact-big ${profitClass}">${formatNumber(plan.totalProfit, true)}</div>
          </div>
          <div class="plan-compact-bottom">
            <div class="plan-compact-col">
              <div class="plan-compact-col-label">昨日利润</div>
              <div class="plan-compact-col-value ${lastDayProfitClass}">${plan.hasYesterdayData ? formatNumber(plan.yesterdayProfit, true) : '-'}</div>
            </div>
            <div class="plan-compact-col">
              <div class="plan-compact-col-label">昨日投入</div>
              <div class="plan-compact-col-value">${plan.hasYesterdayData ? formatNumber(plan.yesterdayInvested) : '-'}</div>
            </div>
            <div class="plan-compact-col">
              <div class="plan-compact-col-label">累计投入</div>
              <div class="plan-compact-col-value">${formatNumber(plan.totalInvested)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('加载计划失败:', error);
  }
}

// 显示创建弹窗
function showCreateModal() {
  document.getElementById('createModal').classList.add('show');
}

// 隐藏创建弹窗
function hideCreateModal() {
  document.getElementById('createModal').classList.remove('show');
  document.getElementById('createForm').reset();
}

// 创建计划
document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('planName').value;

  try {
    await api.createPlan({ name });
    hideCreateModal();
    loadPlans();
    loadSummary();
  } catch (error) {
    alert(error.message);
  }
});
