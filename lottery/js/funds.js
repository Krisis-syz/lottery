// ============ 全局状态 ============
let allSources = [];
let allRecords = [];
let currentMonth = getCurrentYearMonth();
let sortAsc = true;

const COLORS = ['#946FB2', '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#22c55e'];
const ICONS = ['fa-solid fa-wallet', 'fa-solid fa-landmark', 'fa-solid fa-credit-card', 'fa-solid fa-piggy-bank', 'fa-solid fa-chart-line', 'fa-solid fa-coins', 'fa-solid fa-building-columns', 'fa-solid fa-money-bill-wave'];

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  if (!(await requireAuth())) return;
  await loadAllData();
  renderAssets();
});

async function loadAllData() {
  try {
    allSources = await fundApi.getSources();
    allRecords = await fundApi.getAllRecords();
  } catch (e) {
    console.error('加载数据失败:', e);
  }
}

// ============ 渲染资产 ============
function renderAssets() {
  renderTotalCard();
  renderAssetGrid();
}

function renderTotalCard() {
  const total = getMonthTotal(currentMonth);
  const prev = getMonthTotal(getPrevMonth(currentMonth));
  const diff = total - prev;

  document.getElementById('totalAmount').textContent = '¥' + fmtNum(total);

  const pnlEl = document.getElementById('monthPnl');
  if (prev > 0 || total > 0) {
    pnlEl.textContent = (diff >= 0 ? '+' : '-') + fmtNum(diff) + '    本月';
    pnlEl.className = 'total-pnl';
    pnlEl.style.color = diff >= 0 ? '#ef4444' : '#22c55e';
  } else {
    pnlEl.textContent = '暂无数据';
    pnlEl.className = 'total-pnl';
    pnlEl.style.color = '';
  }

  // 资产大类标签
  const tagsEl = document.getElementById('totalTags');
  if (allSources.length === 0) {
    tagsEl.innerHTML = '';
    return;
  }

  const typeMap = { '流动': 0, '基金': 0, '股票': 0 };
  const typeColors = { '流动': '#a78bfa', '基金': '#60a5fa', '股票': '#f472b6' };
  allSources.forEach(s => {
    const amt = getAmountForMonth(s.id, currentMonth);
    const t = s.type || '流动';
    if (typeMap[t] !== undefined) typeMap[t] += amt;
    else typeMap['流动'] += amt;
  });

  tagsEl.innerHTML = Object.entries(typeMap).map(([name, amt]) => {
    const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : '0.0';
    return `<div class="total-tag"><span class="total-tag-dot" style="background:${typeColors[name]}"></span>${name} ${pct}%</div>`;
  }).join('');
}

function renderAssetGrid() {
  const grid = document.getElementById('assetGrid');

  if (allSources.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-wallet"></i><p>还没有资产，点击 + 添加</p></div>`;
    return;
  }

  const items = allSources.map((s, i) => {
    const total = getAmountForMonth(s.id, currentMonth);
    const prev = getAmountForMonth(s.id, getPrevMonth(currentMonth));
    const diff = total - prev;
    let pnlClass = 'flat', pnlText = '本月 +0';
    if (prev > 0 || total > 0) {
      pnlClass = diff >= 0 ? 'up' : 'down';
      pnlText = '本月 ' + (diff >= 0 ? '+' : '-') + fmtNum(diff);
    }
    return { ...s, total, pnlClass, pnlText, color: COLORS[i % COLORS.length], icon: ICONS[i % ICONS.length], idx: i };
  });

  if (sortAsc) items.sort((a, b) => b.total - a.total);

  grid.innerHTML = items.map(item => `
    <div class="asset-card">
      <div class="asset-info">
        <div class="asset-top-row">
          <div class="asset-name">${item.name}</div>
          <div class="asset-pnl ${item.pnlClass}">${item.pnlText}</div>
        </div>
        <div class="asset-amount">¥${fmtNum(item.total)}</div>
      </div>
      <div class="asset-icon" style="background:${item.color}18;color:${item.color};">
        <i class="${item.icon}"></i>
      </div>
    </div>
  `).join('');
}

// ============ 排序 ============
function toggleSort() {
  sortAsc = !sortAsc;
  const icon = document.querySelector('#sortBtn i');
  icon.className = sortAsc ? 'fa-solid fa-arrow-down-wide-short' : 'fa-solid fa-arrow-up-wide-short';
  renderAssetGrid();
}

// ============ 新增/删除 ============
function showAddModal() {
  document.getElementById('addModal').classList.add('show');
  const inp = document.getElementById('addModalInput');
  inp.value = '';
  setTimeout(() => inp.focus(), 100);
}

function hideAddModal() { document.getElementById('addModal').classList.remove('show'); }

document.getElementById('addModal').addEventListener('click', e => { if (e.target === e.currentTarget) hideAddModal(); });
document.getElementById('addModalInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddSource(); });

async function confirmAddSource() {
  const inp = document.getElementById('addModalInput');
  const name = inp.value.trim();
  if (!name) return;
  try {
    await fundApi.addSource(name);
    allSources = await fundApi.getSources();
    hideAddModal();
    renderAssets();
  } catch (e) { alert('添加失败: ' + e.message); }
}

// ============ 底部导航 ============
function switchPage(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  event.currentTarget.classList.add('active');
  // 其他页面后续扩展
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

function fmtNum(n) {
  return Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
