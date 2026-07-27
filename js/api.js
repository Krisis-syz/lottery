// Supabase 配置
const SUPABASE_URL = 'https://wcstsltmdcmenxkepyzk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjc3RzbHRtZGNtZW54a2VweXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNjI4MTAsImV4cCI6MjEwMDYzODgxMH0.Hx6nJlZwcCyML7DaqDUUNRx-Po6K6bd6At6PeDVWJ5Q';

// 初始化 Supabase 客户端
let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return supabaseClient;
  }

  // 如果 SDK 还没加载，直接创建（备用方案）
  if (window.createClient) {
    supabaseClient = window.createClient(SUPABASE_URL, SUPABASE_KEY);
    return supabaseClient;
  }

  return null;
}

// 等待 Supabase SDK 加载
function waitForSupabase() {
  return new Promise((resolve) => {
    // 如果已经初始化，直接返回
    if (getSupabase()) {
      resolve();
      return;
    }

    // 检查SDK是否已加载
    const check = () => {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        resolve();
        return;
      }
      setTimeout(check, 100);
    };

    check();

    // 10秒超时
    setTimeout(() => {
      if (!supabaseClient) {
        console.error('Supabase SDK 加载超时');
      }
      resolve();
    }, 10000);
  });
}

// 主题切换
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.textContent = theme === 'light' ? '🌙' : '☀️';
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

initTheme();

// 密码验证（通过 Supabase 函数）
async function verifyPassword(password) {
  await waitForSupabase();
  const sb = getSupabase();
  const { data, error } = await sb.rpc('verify_password', { input_password: password });
  if (error) throw error;
  return data;
}

async function getPasswordInput() {
  return prompt('请输入操作密码：');
}

// API 对象
const api = {
  // 获取所有计划（带汇总）
  getPlans: async () => {
    await waitForSupabase();
    const sb = getSupabase();

    const { data: plans, error: plansError } = await sb
      .from('plans')
      .select('*')
      .order('created_at', { ascending: false });

    if (plansError) throw plansError;

    const { data: records, error: recordsError } = await sb
      .from('records')
      .select('*')
      .order('date', { ascending: true });

    if (recordsError) throw recordsError;

    // 合并计划和记录，计算汇总
    return plans.map(plan => {
      const planRecords = records.filter(r => r.plan_id === plan.id);
      let totalInvested = 0;
      let totalReturned = 0;
      let loseStreak = 0;
      let lastSettledRecord = null;

      // 找最近已结算的记录
      for (let i = planRecords.length - 1; i >= 0; i--) {
        if (planRecords[i].result) {
          lastSettledRecord = planRecords[i];
          break;
        }
      }

      planRecords.forEach(record => {
        totalInvested += record.bet_amount;
        totalReturned += record.win_amount;
      });

      // 计算连黑次数
      for (let i = planRecords.length - 1; i >= 0; i--) {
        if (planRecords[i].result === 'lose') loseStreak++;
        else if (planRecords[i].result === 'win') break;
      }

      return {
        id: plan.id,
        name: plan.name,
        type: plan.type,
        initialAmount: plan.initial_amount,
        status: plan.status,
        records: planRecords.map(r => ({
          id: r.id,
          date: r.date,
          betAmount: r.bet_amount,
          result: r.result,
          winAmount: r.win_amount,
          profit: r.profit,
          multiplier: r.multiplier
        })),
        totalInvested,
        totalReturned,
        totalProfit: totalReturned - totalInvested,
        loseStreak,
        lastSettledRecord: lastSettledRecord ? {
          betAmount: lastSettledRecord.bet_amount,
          winAmount: lastSettledRecord.win_amount,
          profit: lastSettledRecord.profit
        } : null
      };
    }).sort((a, b) => a.status === 'paused' ? 1 : b.status === 'paused' ? -1 : 0);
  },

  // 创建计划
  createPlan: async (data) => {
    const password = await getPasswordInput();
    if (!password || !(await verifyPassword(password))) throw new Error('密码错误');

    await waitForSupabase();
    const sb = getSupabase();

    const { error } = await sb
      .from('plans')
      .insert({
        name: data.name,
        type: 'normal',
        initial_amount: null,
        status: 'active'
      });

    if (error) throw error;
  },

  // 获取单个计划
  getPlan: async (id) => {
    await waitForSupabase();
    const sb = getSupabase();

    const { data: plan, error: planError } = await sb
      .from('plans')
      .select('*')
      .eq('id', id)
      .single();

    if (planError) throw planError;

    const { data: records, error: recordsError } = await sb
      .from('records')
      .select('*')
      .eq('plan_id', id)
      .order('date', { ascending: true });

    if (recordsError) throw recordsError;

    return {
      id: plan.id,
      name: plan.name,
      type: plan.type,
      initialAmount: plan.initial_amount,
      status: plan.status,
      records: records.map(r => ({
        id: r.id,
        date: r.date,
        betAmount: r.bet_amount,
        result: r.result,
        winAmount: r.win_amount,
        profit: r.profit,
        multiplier: r.multiplier
      }))
    };
  },

  // 更新计划状态
  updatePlanStatus: async (id) => {
    const password = await getPasswordInput();
    if (!password || !(await verifyPassword(password))) throw new Error('密码错误');

    await waitForSupabase();
    const sb = getSupabase();

    const { data: plan, error: getError } = await sb
      .from('plans')
      .select('status')
      .eq('id', id)
      .single();

    if (getError) throw getError;

    const newStatus = plan.status === 'active' ? 'paused' : 'active';

    const { error } = await sb
      .from('plans')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
  },

  // 添加投注记录
  addRecord: async (planId, data) => {
    const password = await getPasswordInput();
    if (!password || !(await verifyPassword(password))) throw new Error('密码错误');

    await waitForSupabase();
    const sb = getSupabase();

    const { error } = await sb
      .from('records')
      .insert({
        plan_id: planId,
        date: data.date,
        bet_amount: data.betAmount,
        result: null,
        win_amount: 0,
        profit: 0,
        multiplier: null
      });

    if (error) throw error;
  },

  // 更新投注结果
  updateRecord: async (planId, recordId, data) => {
    const password = await getPasswordInput();
    if (!password || !(await verifyPassword(password))) throw new Error('密码错误');

    await waitForSupabase();
    const sb = getSupabase();

    const updateData = {};

    if (data.betAmount !== undefined) {
      updateData.bet_amount = data.betAmount;
    }
    if (data.result !== undefined) {
      updateData.result = data.result;
      updateData.win_amount = data.result === 'win' ? data.winAmount : 0;
    }

    // 计算净利润
    const { data: record, error: getError } = await sb
      .from('records')
      .select('bet_amount')
      .eq('id', recordId)
      .single();

    if (getError) throw getError;

    updateData.profit = (updateData.win_amount || 0) - (updateData.bet_amount || record.bet_amount);

    const { error } = await sb
      .from('records')
      .update(updateData)
      .eq('id', recordId);

    if (error) throw error;
  },

  // 获取汇总数据
  getSummary: async () => {
    await waitForSupabase();
    const sb = getSupabase();

    const { data: records, error } = await sb
      .from('records')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;

    let totalInvested = 0;
    let totalReturned = 0;

    records.forEach(record => {
      totalInvested += record.bet_amount;
      totalReturned += record.win_amount;
    });

    // 计算昨日汇总（严格昨天）
    let yesterdaySummary = null;
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const yesterdayRecords = records.filter(r => r.date === yesterdayStr);
    if (yesterdayRecords.length > 0) {
      let invested = 0, returned = 0, profit = 0;
      yesterdayRecords.forEach(r => {
        invested += r.bet_amount;
        returned += r.win_amount;
        profit += r.profit;
      });
      yesterdaySummary = { date: yesterdayStr, invested, returned, profit };
    }

    return {
      totalInvested,
      totalReturned,
      totalProfit: totalReturned - totalInvested,
      yesterdaySummary
    };
  },

  // 获取历史数据
  getHistory: async () => {
    await waitForSupabase();
    const sb = getSupabase();

    const { data: records, error } = await sb
      .from('records')
      .select('*, plans(name, type)')
      .order('date', { ascending: false });

    if (error) throw error;

    // 按日期分组计算每日收益
    const dailyProfits = {};
    records.forEach(record => {
      if (!record.result) return;
      if (!dailyProfits[record.date]) {
        dailyProfits[record.date] = 0;
      }
      dailyProfits[record.date] += record.profit;
    });

    // 转换为数组并排序
    const history = Object.entries(dailyProfits)
      .map(([date, profit]) => ({ date, profit }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 计算累计收益
    let cumulative = 0;
    const cumulativeHistory = history.map(item => {
      cumulative += item.profit;
      return { ...item, cumulative };
    });

    return {
      dailyProfits: cumulativeHistory,
      allRecords: records.map(r => ({
        planName: r.plans?.name,
        planType: r.plans?.type,
        id: r.id,
        date: r.date,
        betAmount: r.bet_amount,
        result: r.result,
        winAmount: r.win_amount,
        profit: r.profit,
        multiplier: r.multiplier
      }))
    };
  }
};
