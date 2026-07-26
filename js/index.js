// 页面加载时获取数据
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  loadSummary();
  loadPlans();
});

// 加载汇总数据
async function loadSummary() {
  try {
    const summary = await api.getSummary();
    document.getElementById('totalInvested').textContent = `¥${summary.totalInvested.toFixed(2)}`;

    const returnedEl = document.getElementById('totalReturned');
    returnedEl.textContent = `¥${summary.totalReturned.toFixed(2)}`;

    const profitEl = document.getElementById('totalProfit');
    profitEl.textContent = `¥${summary.totalProfit.toFixed(2)}`;
    profitEl.className = `card-value ${summary.totalProfit >= 0 ? 'positive' : 'negative'}`;

    // 显示上日数据
    if (summary.yesterdaySummary && summary.yesterdaySummary.date) {
      const y = summary.yesterdaySummary;
      document.getElementById('lastDayInvested').textContent = `上日 ¥${y.invested.toFixed(2)}`;
      document.getElementById('lastDayReturned').textContent = `上日 ¥${y.returned.toFixed(2)}`;
      const profitSub = document.getElementById('lastDayProfit');
      profitSub.textContent = `上日 ¥${y.profit.toFixed(2)}`;
      profitSub.style.color = y.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    }
  } catch (error) {
    console.error('加载汇总失败:', error);
  }
}

// 加载计划列表
async function loadPlans() {
  try {
    const plans = await api.getPlans();
    console.log('加载的计划:', plans);
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
      const typeClass = plan.type === 'martingale' ? 'martingale' : '';
      const statusClass = plan.status;
      const href = `plan.html?id=${plan.id}`;
      console.log('生成链接:', href);

      return `
        <div class="plan-card ${typeClass} ${statusClass}" onclick="window.location.assign('${href}')">
          <div class="plan-header">
            <span class="plan-name">${plan.name}${plan.loseStreak > 0 ? ` <span class="lose-streak">${plan.loseStreak}连黑</span>` : ''}</span>
            <div>
              <span class="plan-type ${typeClass}">${plan.type === 'martingale' ? '加注' : '普通'}</span>
              <span class="plan-status ${statusClass}">${plan.status === 'active' ? '进行中' : '已暂停'}</span>
            </div>
          </div>
          <div class="plan-stats">
            <div class="plan-stat">
              <div class="plan-stat-label">本金</div>
              <div class="plan-stat-value">¥${plan.totalInvested.toFixed(2)}</div>
            </div>
            <div class="plan-stat">
              <div class="plan-stat-label">回收</div>
              <div class="plan-stat-value">¥${plan.totalReturned.toFixed(2)}</div>
            </div>
            <div class="plan-stat">
              <div class="plan-stat-label">净收益</div>
              <div class="plan-stat-value ${plan.totalProfit >= 0 ? 'win' : 'lose'}">
                ¥${plan.totalProfit.toFixed(2)}
              </div>
            </div>
          </div>
          ${plan.lastSettledRecord ? `
            <div class="plan-last-day ${plan.lastSettledRecord.profit >= 0 ? 'win' : 'lose'}">
              <span>上日: </span>
              <span>本金 ¥${plan.lastSettledRecord.betAmount.toFixed(2)}</span>
              <span> | 回收 ¥${plan.lastSettledRecord.winAmount.toFixed(2)}</span>
              <span> | 净收益 ¥${plan.lastSettledRecord.profit.toFixed(2)}</span>
            </div>
          ` : ''}
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
  document.getElementById('initialAmountGroup').style.display = 'none';
}

// 切换初始本金输入框
function toggleInitialAmount() {
  const type = document.getElementById('planType').value;
  document.getElementById('initialAmountGroup').style.display = type === 'martingale' ? 'block' : 'none';
}

// 创建计划
document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('planName').value;
  const type = document.getElementById('planType').value;
  const initialAmount = document.getElementById('initialAmount').value;

  try {
    await api.createPlan({
      name,
      type,
      initialAmount: type === 'martingale' ? Number(initialAmount) : null,
    });
    hideCreateModal();
    loadPlans();
    loadSummary();
  } catch (error) {
    alert(error.message);
  }
});

// 导出静态HTML（已移除）
async function exportHTML() {
  alert('导出功能已移除，请直接访问动态网站');
}
