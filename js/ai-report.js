// ============ AI 投注报告 ============

let reportData = null;    // 当前报告的原始数据
let currentCharts = [];   // 当前图表配置

// ============ 初始化 ============

document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  if (!(await requireAuth())) return;
  initMonthSelect();
  loadHistoryReports();
});

function initMonthSelect() {
  const sel = document.getElementById('reportMonth');
  const now = new Date();
  let html = '';
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    html += `<option value="${ym}"${i === 0 ? ' selected' : ''}>${label}</option>`;
  }
  sel.innerHTML = html;
}

// ============ 数据收集 ============

function getMonthRange(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, year: y, month: m, lastDay };
}

function getPrevYM(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

async function collectReportData(yearMonth) {
  const sb = getSupabase();
  const user = await getCurrentUser();
  const range = getMonthRange(yearMonth);
  const prevYM = getPrevYM(yearMonth);

  // 并行获取本月和上月数据
  const prevRange = getMonthRange(prevYM);
  const [curRecordsRes, prevRecordsRes, plansRes] = await Promise.all([
    sb.from('records').select('*').eq('user_id', user.id).gte('date', range.start).lte('date', range.end).order('date', { ascending: true }),
    sb.from('records').select('*').eq('user_id', user.id).gte('date', prevRange.start).lte('date', prevRange.end).order('date', { ascending: true }),
    sb.from('plans').select('*').eq('user_id', user.id)
  ]);

  const curRecords = curRecordsRes.data || [];
  const prevRecords = prevRecordsRes.data || [];
  const plans = plansRes.data || [];

  // 计划名称映射
  const planMap = {};
  plans.forEach(p => { planMap[p.id] = p.name; });

  // --- 本月每日汇总 ---
  const dailyMap = {};
  curRecords.forEach(r => {
    if (!dailyMap[r.date]) dailyMap[r.date] = { invested: 0, returned: 0, profit: 0, count: 0 };
    dailyMap[r.date].invested += r.bet_amount;
    dailyMap[r.date].returned += r.win_amount;
    dailyMap[r.date].profit += r.profit;
    dailyMap[r.date].count++;
  });
  const dailySorted = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]));
  let cumulative = 0;
  const dailyProfits = dailySorted.map(([date, d]) => {
    cumulative += d.profit;
    return { date, dayProfit: d.profit, cumulative, invested: d.invested, returned: d.returned, count: d.count };
  });

  // --- 本月总览 ---
  let totalInvested = 0, totalReturned = 0, totalProfit = 0;
  curRecords.forEach(r => { totalInvested += r.bet_amount; totalReturned += r.win_amount; totalProfit += r.profit; });
  const roi = totalInvested > 0 ? (totalProfit / totalInvested * 100) : 0;

  // --- 上月总览 ---
  let prevInvested = 0, prevReturned = 0, prevProfit = 0;
  prevRecords.forEach(r => { prevInvested += r.bet_amount; prevReturned += r.win_amount; prevProfit += r.profit; });

  // --- 分计划统计 ---
  const planStats = plans.map(plan => {
    const curPlanRecords = curRecords.filter(r => r.plan_id === plan.id);
    const prevPlanRecords = prevRecords.filter(r => r.plan_id === plan.id);

    let pInvested = 0, pReturned = 0, pProfit = 0;
    curPlanRecords.forEach(r => { pInvested += r.bet_amount; pReturned += r.win_amount; pProfit += r.profit; });

    let ppInvested = 0, ppReturned = 0, ppProfit = 0;
    prevPlanRecords.forEach(r => { ppInvested += r.bet_amount; ppReturned += r.win_amount; ppProfit += r.profit; });

    // 累计总利润（所有记录）
    const allPlanRecords = curRecords.filter(r => r.plan_id === plan.id);
    let cumProfit = 0;
    allPlanRecords.forEach(r => { cumProfit += r.profit; });

    // 环比
    let momChange = null;
    if (ppProfit !== 0) {
      momChange = prevProfit !== 0 ? ((pProfit - ppProfit) / Math.abs(ppProfit) * 100) : null;
    }

    // 最大连黑数（跨天连续）
    const maxLoseStreak = calcMaxLoseStreak(curPlanRecords, prevPlanRecords, range);

    // 每日明细
    const dailyDetails = [];
    const dayMap = {};
    curPlanRecords.forEach(r => {
      if (!dayMap[r.date]) dayMap[r.date] = { invested: 0, returned: 0, profit: 0, results: [] };
      dayMap[r.date].invested += r.bet_amount;
      dayMap[r.date].returned += r.win_amount;
      dayMap[r.date].profit += r.profit;
      dayMap[r.date].results.push(r.result === 'win' ? '中' : r.result === 'lose' ? '未中' : '-');
    });
    Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, d]) => {
      dailyDetails.push({
        date,
        invested: d.invested,
        profit: d.profit,
        resultText: d.results.join('/')
      });
    });

    return {
      name: plan.name,
      id: plan.id,
      invested: pInvested,
      returned: pReturned,
      profit: pProfit,
      cumProfit,
      prevInvested: ppInvested,
      prevProfit: ppProfit,
      momChange,
      maxLoseStreak,
      dailyDetails,
      recordCount: curPlanRecords.length
    };
  });

  // 过滤有数据的计划
  const activePlanStats = planStats.filter(p => p.recordCount > 0 || p.prevInvested > 0);
  activePlanStats.sort((a, b) => b.profit - a.profit);

  return {
    yearMonth,
    range,
    totalInvested,
    totalReturned,
    totalProfit,
    roi,
    prevInvested,
    prevReturned,
    prevProfit,
    dailyProfits,
    planStats: activePlanStats,
    totalRecords: curRecords.length,
    activeDays: dailySorted.length
  };
}

// 计算最大连黑数（跨天连续未中）
function calcMaxLoseStreak(curRecords, prevRecords, range) {
  // 按日期分组，检查每天是否有未中
  const dayResults = {};
  curRecords.forEach(r => {
    if (!dayResults[r.date]) dayResults[r.date] = [];
    dayResults[r.date].push(r.result);
  });

  // 获取所有有记录的日期
  const allDates = Object.keys(dayResults).sort();
  if (allDates.length === 0) return 0;

  // 检查上月最后一天是否未中（用于跨月连黑）
  let streak = 0;
  let maxStreak = 0;

  // 先检查上月最后一天
  if (prevRecords.length > 0) {
    const prevDates = [...new Set(prevRecords.map(r => r.date))].sort();
    const lastPrevDate = prevDates[prevDates.length - 1];
    const lastPrevResults = prevRecords.filter(r => r.date === lastPrevDate).map(r => r.result);
    if (lastPrevResults.every(r => r === 'lose')) {
      // 上月最后一天全部未中，继续往前追溯
      streak = traceBackLoseStreak(prevRecords, lastPrevDate);
    }
  }

  // 遍历本月日期
  for (const date of allDates) {
    const results = dayResults[date];
    const allLose = results.every(r => r === 'lose');
    if (allLose) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  return maxStreak;
}

// 向前追溯连黑（跨天连续未中）
function traceBackLoseStreak(records, fromDate) {
  const dayResults = {};
  records.forEach(r => {
    if (!dayResults[r.date]) dayResults[r.date] = [];
    dayResults[r.date].push(r.result);
  });
  const dates = Object.keys(dayResults).sort();
  let streak = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const results = dayResults[dates[i]];
    if (results.every(r => r === 'lose')) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ============ 构建 AI Prompt ============

function buildAIPrompt(data) {
  const { yearMonth, totalInvested, totalReturned, totalProfit, roi, dailyProfits, planStats } = data;
  const [y, m] = yearMonth.split('-');

  let prompt = `你是一位专业的体彩投注分析师。请根据以下真实数据生成${y}年${parseInt(m)}月的投注分析报告。

【重要】直接输出报告正文，禁止输出任何开场白、问候语、过渡语（如"好的"、"收到"、"以下是"等）。报告以"# 📊 本月投注总览分析"开头。

【颜色规则】使用HTML span标签强调数字，格式必须完全一致：
- 盈利/正数用红色：<span style="color:#ef4444">+金额</span>（注意包含+号）
- 亏损/负数用绿色：<span style="color:#10b981">-金额</span>
- 正确示例：净利润：<span style="color:#ef4444">+3,923.76元</span>
- 正确示例：亏损：<span style="color:#10b981">-500.00元</span>
- 错误示例：净利润：<span style="color:#ef4444">3923.76</span>（缺少+号和单位）

## 数据说明
请严格按照以下数据生成报告，不得编造或省略任何数据。

---

## 一、本月投注总览

【核心指标】必须按以下格式，每个指标独占一行，用 | 分隔成两行：
- 总投入：${totalInvested.toFixed(2)} 元 | 总回收：${totalReturned.toFixed(2)} 元
- 净利润：${totalProfit.toFixed(2)} 元 | 收益率：${roi.toFixed(2)}%
- 投注天数：${data.activeDays} 天 | 投注笔数：${data.totalRecords} 笔

### 每日数据

| 日期 | 单日利润 | 累计利润 | 投入 | 回收 |
|------|----------|----------|------|------|
${dailyProfits.map(d => `| ${d.date} | ${d.dayProfit.toFixed(2)} | ${d.cumulative.toFixed(2)} | ${d.invested.toFixed(2)} | ${d.returned.toFixed(2)} |`).join('\n')}

---

## 二、分计划分析

| 计划名称 | 本月投入 | 本月利润 | 累计总利润 | 环比(%) | 最大连黑 | 投注笔数 |
|----------|----------|----------|------------|---------|----------|----------|
${planStats.map(p => `| ${p.name} | ${p.invested.toFixed(2)} | ${p.profit.toFixed(2)} | ${p.cumProfit.toFixed(2)} | ${p.momChange !== null ? p.momChange.toFixed(1) : 'N/A'} | ${p.maxLoseStreak} | ${p.recordCount} |`).join('\n')}

### 各计划每日明细
${planStats.map(p => `
**${p.name}**
| 日期 | 投入 | 结果 | 利润 |
|------|------|------|------|
${p.dailyDetails.map(d => `| ${d.date} | ${d.invested.toFixed(2)} | ${d.resultText} | ${d.profit.toFixed(2)} |`).join('\n')}
`).join('\n')}

---

## 输出格式要求

1. 全文使用标准Markdown，分四大章节，每章节开头用对应emoji引导
2. 全部金额统一保留2位小数
3. 重点数字使用颜色强调：
   - 盈利/正数用红色：<span style="color:#ef4444">数字</span>
   - 亏损/负数用绿色：<span style="color:#10b981">数字</span>
   - 例如：净利润：<span style="color:#ef4444">+3,923.76元</span>，收益率：<span style="color:#ef4444">30.30%</span>
   - 例如：亏损：<span style="color:#10b981">-500.00元</span>
4. 禁止省略任意模块数据，不遗漏计划，不编造数据
5. 排版简洁商务风，无多余花哨表情

【换行规则】每个要点必须独占一行！
- 例如：核心盈利来源：梨子半全场（+1,632.10元）
- 例如：主要亏损原因：霸道计划亏损（-17.16元）
- 禁止将多个要点合并到同一行！

【表格规则】分计划分析必须包含以下所有列，缺一不可：
| 计划名称 | 本月投入 | 本月利润 | 累计总利润 | 环比(%) | 最大连黑 | 投注笔数 |

### 图表标记
在报告中适当位置插入以下标记，系统会自动渲染图表：
- 在第一章节末尾插入 [chart:trend] 渲染本月累计利润趋势图
- 在第一章节末尾插入 [chart:calendar] 渲染本月利润日历图
- 在第二章节表格后插入 [chart:treemap] 渲染计划利润横向柱状图

### 章节结构

**x年x月投注总览分析**（📊）//这里的x要替换为数字
- 核心指标汇总
- 文字分析盈亏原因、资金效率
-  [chart:trend]
-  [chart:calendar]

**分计划投注分析**（📋）
- 按本月利润降序排列的表格（包括：|计划名称 | 本月投入 | 本月利润 | 累计总利润 | 环比(%) | 最大连黑 | ）
-  [chart:treemap]
- 数据深度分析：盈利贡献、亏损拖累、环比变化、连黑稳定性等

**风险识别**（⚠️）
- 风险点：不稳定计划、不理性行为、高风险日期
- 正确行为：好的策略、稳定计划
- 可行性总结：是否可持续、是否需调整

**本月投注总结**（📝）
- 整体盈亏结论（一句话总结盈亏和收益率）
- 核心盈利来源（列出盈利最多的计划，每个计划一行）
- 主要亏损原因（列出亏损项目，每个一行）
- 下月优化方向（分条列出，每条换行）

【强制换行规则】
1. 每个要点必须以 `- ` 开头，独占一行
2. 禁止将多个要点合并到同一行！
3. 例如：
- 整体盈亏：本月净利润+3,923.76元，收益率30.30%
- 核心盈利来源：梨子半全场（+1,632.10元）
- 主要亏损原因：霸道计划（-17.16元）`;

  return prompt;
}

// ============ AI 报告生成 ============

async function generateReport() {
  const yearMonth = document.getElementById('reportMonth').value;
  const btn = document.getElementById('generateBtn');
  const status = document.getElementById('reportStatus');

  btn.disabled = true;
  btn.textContent = '生成中...';
  status.style.display = 'block';
  status.className = 'report-status loading';
  status.textContent = '正在收集数据并生成报告，请稍候...';

  try {
    // 收集数据
    reportData = await collectReportData(yearMonth);

    // 构建 prompt
    const prompt = buildAIPrompt(reportData);

    // 调用 AI
    status.textContent = 'AI 正在分析数据，预计需要 30-60 秒...';
    const sb = getSupabase();
    const { data: result, error } = await sb.functions.invoke('generate-report', { body: { prompt } });
    if (error) throw error;

    const reportText = typeof result === 'string' ? result : (result.reportText || result.report || result.content || result.text || JSON.stringify(result));

    // 渲染报告
    renderReport(reportText);

    // 保存到数据库
    await saveReport(yearMonth, reportText);

    status.className = 'report-status loading';
    status.textContent = '报告生成成功！';

    // 刷新历史列表
    loadHistoryReports();
  } catch (err) {
    console.error('生成报告失败:', err);
    status.className = 'report-status error';
    status.textContent = '生成失败：' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '生成报告';
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  }
}

// ============ 渲染报告 ============

function renderReport(text) {
  const area = document.getElementById('reportArea');
  const content = document.getElementById('reportContent');

  // 解析图表标记，替换为 canvas 占位
  const { html, charts } = parseChartMarkers(text);
  currentCharts = charts;

  // 渲染 markdown
  content.innerHTML = simpleMarkdown(html);
  area.style.display = 'block';

  // 内联渲染图表（替换占位 div）
  charts.forEach(chart => {
    const placeholder = content.querySelector(`[data-chart-id="${chart.id}"]`);
    if (!placeholder) return;

    if (chart.type === 'trend') {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-inline';
      wrapper.innerHTML = '<div style="text-align:center;font-size:13px;color:var(--gold);font-weight:500;margin-bottom:8px;">本月累计利润趋势</div>';
      const cvs = document.createElement('canvas');
      wrapper.appendChild(cvs);
      placeholder.replaceWith(wrapper);
      renderTrendChart(cvs, reportData.dailyProfits);
    } else if (chart.type === 'calendar') {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-inline';
      wrapper.innerHTML = '<div style="text-align:center;font-size:13px;color:var(--gold);font-weight:500;margin-bottom:8px;">本月利润日历</div>';
      const calDiv = document.createElement('div');
      wrapper.appendChild(calDiv);
      placeholder.replaceWith(wrapper);
      renderCalendarHeatmap(calDiv, reportData.dailyProfits, reportData.range);
    } else if (chart.type === 'treemap') {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-inline';
      wrapper.innerHTML = '<div style="text-align:center;font-size:13px;color:var(--gold);font-weight:500;margin-bottom:8px;">计划利润对比</div>';
      const cvs = document.createElement('canvas');
      wrapper.appendChild(cvs);
      placeholder.replaceWith(wrapper);
      renderTreemap(cvs, reportData.planStats);
    }
  });
}

// ============ Markdown 解析 ============

function simpleMarkdown(text) {
  if (!text) return '';

  // 占位符保护：先提取图表标记和 HTML 块，用 \x00 占位
  const stash = [];
  const keep = (s) => { stash.push(s); return `\x00${stash.length - 1}\x00`; };

  // 保护已有的 HTML div（图表占位符等）
  text = text.replace(/<div[^>]*>.*?<\/div>/gs, m => keep(m));
  // 保护带颜色的 span 标签
  text = text.replace(/<span style="color:[^"]*">.*?<\/span>/g, m => keep(m));
  // 保护 [chart:xxx] 原始标记
  text = text.replace(/\[chart:(\w+)\]/g, (m, t) => keep(`<div class="chart-placeholder" data-chart-id="chart-dyn-${t}"></div>`));

  // 表格
  text = text.replace(/(?:^|\n)(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g, function(_, h, s, b) {
    const headers = h.split('|').filter(c => c.trim()).map(c => c.trim());
    const rows = b.trim().split('\n').map(r => r.split('|').filter(c => c.trim()).map(c => c.trim()));
    let t = '<div class="md-table-wrap"><table class="md-table"><thead><tr>' + headers.map(x => `<th>${x}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(r => { t += '<tr>' + r.map(x => `<td>${x}</td>`).join('') + '</tr>'; });
    t += '</tbody></table></div>';
    return '\n' + keep(t) + '\n';
  });

  // 逐行处理
  text = text.split('\n').map(line => {
    const tr = line.trim();
    // 跳过空行和已处理的 HTML
    if (!tr) return '';
    if (tr.startsWith('\x00')) return tr;

    // 水平线
    if (/^---+$/.test(tr)) return keep('<hr style="border:none;border-top:1px solid var(--glass-border);margin:20px 0;">');

    // 标题（注意顺序：先 ### 再 ## 再 #）
    if (tr.startsWith('### ')) return `<h3>${tr.slice(4)}</h3>`;
    if (tr.startsWith('## ')) return `<h3>${tr.slice(3)}</h3>`;
    if (tr.startsWith('# ')) return `<h3>${tr.slice(2)}</h3>`;

    // 列表（含 | 分隔符的渲染为横排指标）
    if (tr.startsWith('- ') || tr.startsWith('• ')) {
      const content = tr.slice(2);
      if (content.includes('|') && !content.includes('\x00')) {
        // 普通列表项，用 | 分隔
        const items = content.split('|').map(s => s.trim()).filter(Boolean);
        return '<div style="display:flex;flex-wrap:wrap;gap:6px 12px;margin:6px 0;padding:8px 0;">' +
          items.map(item => {
            let s = item.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            return `<span style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);border-radius:6px;padding:4px 10px;font-size:13px;white-space:nowrap;">${s}</span>`;
          }).join('') + '</div>';
      }
      return `<div style="padding-left:12px;margin:3px 0;">• ${content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`;
    }

    // 编号列表 1. 2. 3.
    if (/^\d+\.\s/.test(tr)) {
      return `<div style="padding-left:12px;margin:3px 0;">${tr.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`;
    }

    // 标题后紧跟编号列表：拆为标题 + 列表项
    if (/\s\d+\.\s/.test(tr) && !tr.startsWith('#')) {
      const parts = tr.split(/(?=\s\d+\.\s)/);
      return parts.map(p => {
        const pt = p.trim();
        if (/^\d+\.\s/.test(pt)) {
          return `<div style="padding-left:12px;margin:3px 0;">${pt.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`;
        }
        return `<div style="margin:6px 0 3px;">${pt.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`;
      }).join('');
    }

    // 普通行：加粗，包裹在 div 中确保换行
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return `<div style="margin:4px 0;">${line}</div>`;
  }).join('\n');

  // 恢复占位符
  text = text.replace(/\x00(\d+)\x00/g, (_, i) => stash[parseInt(i)]);

  // 兜底：解析剩余的 ** 加粗
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 最终清理：块级标签后的 <br> 去掉
  text = text.replace(/(<\/(?:h3|table|div|hr[^>]*|strong)>)<br>/g, '$1');
  text = text.replace(/<br>(<(?:h3|table|div|hr))/g, '$1');

  return text;
}

function parseChartMarkers(text) {
  if (!text) return { html: '', charts: [] };
  const charts = [];
  let chartIndex = 0;
  const html = text.replace(/\[chart:(\w+)\]/g, (match, type) => {
    const id = `chart-${chartIndex++}`;
    charts.push({ id, type });
    return `<div class="chart-placeholder" data-chart-id="${id}"></div>`;
  });
  return { html, charts };
}

// ============ 图表渲染（纯 Canvas）============

function renderTrendChart(canvas, dailyProfits) {
  if (!canvas || !dailyProfits || dailyProfits.length === 0) return;
  const ctx = canvas.getContext('2d');
  const parent = canvas.parentElement;
  const W = parent.clientWidth;
  const H = 240;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = '100%';
  canvas.style.height = H + 'px';

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#6b7280' : '#6b7280';
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  const zeroColor = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
  const dotStroke = isLight ? '#ffffff' : '#0a0e17';

  const pad = { top: 24, right: 16, bottom: 36, left: 52 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const values = dailyProfits.map(d => d.cumulative);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const rng = maxVal - minVal || 1;
  const padRng = rng * 0.1;
  const dMin = minVal - padRng;
  const dMax = maxVal + padRng;
  const dRange = dMax - dMin || 1;

  const getX = (i) => pad.left + (i / (values.length - 1 || 1)) * cW;
  const getY = (v) => pad.top + cH - ((v - dMin) / dRange) * cH;

  // 背景
  ctx.clearRect(0, 0, W, H);

  // 网格线
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (cH / 5) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
  }

  // 零线
  if (minVal < 0 && maxVal > 0) {
    const zeroY = getY(0);
    ctx.strokeStyle = zeroColor;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke();
    ctx.setLineDash([]);
  }

  // 平滑曲线点
  const pts = values.map((v, i) => ({ x: getX(i), y: getY(v) }));

  // 填充区域（平滑）
  ctx.beginPath();
  ctx.moveTo(pts[0].x, getY(0));
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const cpx = (prev.x + cur.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, cur.y, cur.x, cur.y);
  }
  ctx.lineTo(pts[pts.length - 1].x, getY(0));
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  grad.addColorStop(0, 'rgba(251,191,36,0.22)');
  grad.addColorStop(0.5, 'rgba(245,158,11,0.08)');
  grad.addColorStop(1, 'rgba(245,158,11,0.01)');
  ctx.fillStyle = grad;
  ctx.fill();

  // 曲线
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const cpx = (prev.x + cur.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, cur.y, cur.x, cur.y);
  }
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(251,191,36,0.3)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 数据点
  pts.forEach((p, i) => {
    const v = values[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = v >= 0 ? '#ef4444' : '#10b981';
    ctx.fill();
    ctx.strokeStyle = dotStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // X 轴标签
  ctx.fillStyle = textColor;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  const maxLabels = Math.min(values.length, 7);
  const step = Math.max(1, Math.ceil(values.length / maxLabels));
  dailyProfits.forEach((d, i) => {
    if (i % step === 0 || i === values.length - 1) {
      ctx.fillText(d.date.substring(5), getX(i), H - pad.bottom + 16);
    }
  });

  // Y 轴标签
  ctx.textAlign = 'right';
  ctx.font = '10px JetBrains Mono, monospace';
  for (let i = 0; i <= 5; i++) {
    const v = dMin + (dRange / 5) * (5 - i);
    ctx.fillStyle = v >= 0 ? 'rgba(239,68,68,0.6)' : 'rgba(16,185,129,0.6)';
    ctx.fillText(v.toFixed(0), pad.left - 6, pad.top + (cH / 5) * i + 4);
  }
}

function renderCalendarHeatmap(container, dailyProfits, range) {
  if (!container || !dailyProfits || dailyProfits.length === 0) return;

  const profitMap = {};
  dailyProfits.forEach(d => { profitMap[d.date] = d.dayProfit; });

  const y = range.year, m = range.month;
  const firstDay = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const maxAbs = Math.max(1, ...dailyProfits.map(d => Math.abs(d.dayProfit)));

  let html = '<div class="day-grid">';
  ['日', '一', '二', '三', '四', '五', '六'].forEach(d => {
    html += `<div class="day-header">${d}</div>`;
  });
  for (let i = 0; i < firstDay; i++) html += '<div class="day-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const p = profitMap[ds];
    let style = '';
    if (p !== undefined && p !== 0) {
      const intensity = Math.min(Math.abs(p) / maxAbs, 1);
      if (p > 0) {
        style = `background:rgba(239,68,68,${0.12 + intensity * 0.4});border-color:rgba(239,68,68,${0.2 + intensity * 0.4});`;
      } else {
        style = `background:rgba(16,185,129,${0.12 + intensity * 0.4});border-color:rgba(16,185,129,${0.2 + intensity * 0.4});`;
      }
    }
    const fc = p > 0 ? '#ef4444' : p < 0 ? '#10b981' : 'var(--text-muted)';
    const txt = p !== undefined ? `${p >= 0 ? '+' : ''}${p.toFixed(0)}` : '';
    html += `<div class="day-cell" style="${style}"><span class="day-num">${d}</span><span class="day-profit" style="color:${fc}">${txt}</span></div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

// ============ Squarified Treemap ============

function renderTreemap(canvas, planStats) {
  if (!canvas || !planStats || planStats.length === 0) return;
  const ctx = canvas.getContext('2d');
  const parent = canvas.parentElement;
  const W = parent.clientWidth;
  const barH = 32;
  const gap = 8;
  const padLeft = 100;
  const padRight = 70;
  const padTop = 10;
  const items = [...planStats].sort((a, b) => b.profit - a.profit);
  const H = padTop + items.length * (barH + gap) + 10;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = '100%';
  canvas.style.height = H + 'px';

  ctx.clearRect(0, 0, W, H);

  // 检测是否亮色主题
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#1e293b' : '#f9fafb';
  const zeroLineColor = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';

  const maxAbs = Math.max(1, ...items.map(p => Math.abs(p.profit)));
  const chartW = W - padLeft - padRight;
  const centerX = padLeft + chartW / 2;

  // 零线
  ctx.strokeStyle = zeroLineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, padTop);
  ctx.lineTo(centerX, H - 10);
  ctx.stroke();

  items.forEach((plan, i) => {
    const y = padTop + i * (barH + gap);
    const barW = (Math.abs(plan.profit) / maxAbs) * (chartW / 2);
    const isProfit = plan.profit >= 0;

    // 柱体
    const color = isProfit ? 'rgba(239,68,68,0.8)' : 'rgba(16,185,129,0.8)';
    ctx.fillStyle = color;
    if (isProfit) {
      ctx.fillRect(centerX, y + 2, barW, barH - 4);
    } else {
      ctx.fillRect(centerX - barW, y + 2, barW, barH - 4);
    }

    // 计划名称（左侧）
    ctx.fillStyle = textColor;
    ctx.font = 'bold 13px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const displayName = plan.name.length > 8 ? plan.name.substring(0, 7) + '…' : plan.name;
    ctx.fillText(displayName, padLeft - 10, y + barH / 2);

    // 数值标注
    ctx.fillStyle = isProfit ? '#dc2626' : '#059669';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = isProfit ? 'left' : 'right';
    const label = `${isProfit ? '+' : ''}${plan.profit.toFixed(0)}`;
    const labelX = isProfit ? centerX + barW + 6 : centerX - barW - 6;
    ctx.fillText(label, labelX, y + barH / 2);
  });
}

// ============ 报告存储 ============

async function saveReport(yearMonth, reportText) {
  const sb = getSupabase();
  const user = await getCurrentUser();
  const { error } = await sb.from('plan_reports').upsert({
    user_id: user.id,
    year_month: yearMonth,
    report_text: reportText,
    status: 'completed',
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,year_month' });
  if (error) console.error('保存报告失败:', error);
}

async function loadHistoryReports() {
  const sb = getSupabase();
  const user = await getCurrentUser();
  const { data, error } = await sb.from('plan_reports')
    .select('year_month, updated_at')
    .eq('user_id', user.id)
    .order('year_month', { ascending: false });
  if (error) { console.error('加载历史失败:', error); return; }

  const list = document.getElementById('historyList');
  const empty = document.getElementById('emptyHistory');
  if (!data || data.length === 0) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  list.innerHTML = data.map(r => {
    const [y, m] = r.year_month.split('-');
    const dateStr = r.updated_at ? new Date(r.updated_at).toLocaleDateString('zh-CN') : '';
    return `<div class="history-item" onclick="viewHistoryReport('${r.year_month}')">
      <span class="history-item-month">${y}年${parseInt(m)}月</span>
      <span class="history-item-date">${dateStr}</span>
    </div>`;
  }).join('');
}

async function viewHistoryReport(yearMonth) {
  const sb = getSupabase();
  const user = await getCurrentUser();
  const { data, error } = await sb.from('plan_reports')
    .select('report_text')
    .eq('user_id', user.id)
    .eq('year_month', yearMonth)
    .single();
  if (error || !data) { alert('加载报告失败'); return; }

  document.getElementById('reportMonth').value = yearMonth;
  reportData = await collectReportData(yearMonth);
  renderReport(data.report_text);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
