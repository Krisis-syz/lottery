function formatNumber(n, showSign) {
  const prefix = showSign ? (n >= 0 ? '+' : '-') : '';
  return prefix + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();

  // 检查登录状态
  if (!(await requireAuth())) return;

  loadPlans();
});

async function loadPlans() {
  try {
    const plans = await api.getPlans();
    const grid = document.getElementById('plansGrid');

    if (plans.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>暂无投资计划</p>
          <button class="btn btn-primary" onclick="showCreateModal()">创建第一个计划</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = plans.map(plan => {
      const statusClass = plan.status;
      const href = `plan.html?id=${plan.id}`;
      const profitClass = plan.totalProfit >= 0 ? 'positive' : 'negative';
      const lastDayProfitClass = plan.yesterdayProfit >= 0 ? 'positive' : 'negative';

      return `
        <div class="plan-card-compact ${statusClass}" onclick="window.location.assign('${href}')">
          <div class="plan-compact-top">
            <span class="plan-compact-name">${plan.name}</span>
            <span class="plan-status ${statusClass}">${plan.status === 'active' ? '进行中' : '已暂停'}</span>
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

function showCreateModal() {
  document.getElementById('createModal').classList.add('show');
}

function hideCreateModal() {
  document.getElementById('createModal').classList.remove('show');
  document.getElementById('createForm').reset();
}

document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('planName').value;
  try {
    await api.createPlan({ name });
    hideCreateModal();
    loadPlans();
  } catch (error) {
    alert(error.message);
  }
});
