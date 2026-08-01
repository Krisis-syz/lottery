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

  if (window.createClient) {
    supabaseClient = window.createClient(SUPABASE_URL, SUPABASE_KEY);
    return supabaseClient;
  }

  return null;
}

// 等待 Supabase SDK 加载
function waitForSupabase() {
  return new Promise((resolve) => {
    if (getSupabase()) {
      resolve();
      return;
    }

    const check = () => {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        resolve();
        return;
      }
      setTimeout(check, 100);
    };

    check();

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

// ============ Auth 函数 ============

async function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function signUp(email, password) {
  await waitForSupabase();
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password
  });
  if (error) throw error;

  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error('该邮箱已注册');
  }

  return {
    user: data.user,
    needsConfirmation: data.user && data.user.identities && data.user.identities.length > 0 && !data.session
  };
}

async function signIn(email, password) {
  await waitForSupabase();
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  await waitForSupabase();
  const sb = getSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
  window.location.href = 'login.html';
}

async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// ============ 数据 API（直连 Supabase）============

const api = {
  // 获取所有计划
  getPlans: async () => {
    const sb = getSupabase();
    const { data: plans, error } = await sb
      .from('plans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 获取记录用于计算汇总
    const { data: records } = await sb
      .from('records')
      .select('*')
      .order('date', { ascending: true });

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);

    return (plans || []).map(plan => {
      const planRecords = (records || []).filter(r => r.plan_id === plan.id);
      let totalInvested = 0, totalReturned = 0, loseStreak = 0;
      let yesterdayProfit = 0, yesterdayInvested = 0, hasYesterdayData = false;

      planRecords.forEach(record => {
        totalInvested += record.bet_amount;
        totalReturned += record.win_amount;
        if (record.date === yesterdayStr) {
          hasYesterdayData = true;
          yesterdayInvested += record.bet_amount;
          if (record.result) yesterdayProfit += record.profit;
        }
      });

      for (let i = planRecords.length - 1; i >= 0; i--) {
        if (planRecords[i].result === 'lose') loseStreak++;
        else if (planRecords[i].result === 'win') break;
      }

      return {
        ...plan,
        totalInvested,
        totalReturned,
        totalProfit: totalReturned - totalInvested,
        loseStreak,
        yesterdayProfit,
        yesterdayInvested,
        hasYesterdayData
      };
    }).sort((a, b) => a.status === 'paused' ? 1 : b.status === 'paused' ? -1 : 0);
  },

  // 创建计划
  createPlan: async (data) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data: plan, error } = await sb
      .from('plans')
      .insert({
        name: data.name,
        type: 'normal',
        initial_amount: null,
        status: 'active',
        user_id: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return { plan };
  },

  // 获取单个计划
  getPlan: async (id) => {
    const sb = getSupabase();
    const { data: plan, error: planError } = await sb
      .from('plans')
      .select('*')
      .eq('id', id)
      .single();

    if (planError) throw planError;

    const { data: records } = await sb
      .from('records')
      .select('*')
      .eq('plan_id', id)
      .order('date', { ascending: true });

    return {
      ...plan,
      records: (records || []).map(r => ({
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
    const sb = getSupabase();
    const { data: plan } = await sb
      .from('plans')
      .select('status')
      .eq('id', id)
      .single();

    const newStatus = plan.status === 'active' ? 'paused' : 'active';
    const { error } = await sb
      .from('plans')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
    return { status: newStatus };
  },

  // 添加投注记录
  addRecord: async (planId, data) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data: record, error } = await sb
      .from('records')
      .insert({
        plan_id: planId,
        date: data.date,
        bet_amount: data.betAmount,
        result: null,
        win_amount: 0,
        profit: 0,
        multiplier: null,
        user_id: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return record;
  },

  // 更新投注结果
  updateRecord: async (planId, recordId, data) => {
    const sb = getSupabase();
    const updateData = {};

    if (data.betAmount !== undefined) {
      updateData.bet_amount = data.betAmount;
    }

    if (data.result !== undefined) {
      updateData.result = data.result;
      updateData.win_amount = data.result === 'win' ? data.winAmount : 0;
    }

    // 获取原始记录以计算利润
    const { data: record } = await sb
      .from('records')
      .select('bet_amount')
      .eq('id', recordId)
      .single();

    updateData.profit = (updateData.win_amount || 0) - (updateData.bet_amount || record.bet_amount);

    const { error } = await sb
      .from('records')
      .update(updateData)
      .eq('id', recordId);

    if (error) throw error;
    return updateData;
  },

  // 删除投注记录
  deleteRecord: async (recordId) => {
    const sb = getSupabase();
    const { error } = await sb.from('records').delete().eq('id', recordId);
    if (error) throw error;
  },

  // 获取汇总数据
  getSummary: async () => {
    const sb = getSupabase();

    // 并行查询
    const [plansResult, recordsResult] = await Promise.all([
      sb.from('plans').select('*').order('created_at', { ascending: false }),
      sb.from('records').select('*').order('date', { ascending: false })
    ]);

    const plans = plansResult.data || [];
    const records = recordsResult.data || [];

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);

    let totalInvested = 0, totalReturned = 0;

    const plansWithSummary = plans.map(plan => {
      const planRecords = records.filter(r => r.plan_id === plan.id);
      let pInvested = 0, pReturned = 0, loseStreak = 0;
      let yesterdayProfit = 0, yesterdayInvested = 0, hasYesterdayData = false;

      planRecords.forEach(record => {
        pInvested += record.bet_amount;
        pReturned += record.win_amount;
        totalInvested += record.bet_amount;
        totalReturned += record.win_amount;
        if (record.date === yesterdayStr) {
          hasYesterdayData = true;
          yesterdayInvested += record.bet_amount;
          if (record.result) yesterdayProfit += record.profit;
        }
      });

      for (let i = planRecords.length - 1; i >= 0; i--) {
        if (planRecords[i].result === 'lose') loseStreak++;
        else if (planRecords[i].result === 'win') break;
      }

      return {
        ...plan,
        totalInvested: pInvested,
        totalReturned: pReturned,
        totalProfit: pReturned - pInvested,
        loseStreak,
        yesterdayProfit,
        yesterdayInvested,
        hasYesterdayData
      };
    }).sort((a, b) => a.status === 'paused' ? 1 : b.status === 'paused' ? -1 : 0);

    let yesterdaySummary = null;
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
      plans: plansWithSummary,
      totalInvested,
      totalReturned,
      totalProfit: totalReturned - totalInvested,
      yesterdaySummary
    };
  },

  // 获取历史数据
  getHistory: async () => {
    const sb = getSupabase();

    const { data: records, error } = await sb
      .from('records')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;

    // 查询计划列表关联名称
    const { data: plans } = await sb
      .from('plans')
      .select('*');

    const planMap = {};
    (plans || []).forEach(p => { planMap[p.id] = p; });

    // 按日期分组计算每日收益
    const dailyProfits = {};
    (records || []).forEach(record => {
      if (!record.result) return;
      if (!dailyProfits[record.date]) dailyProfits[record.date] = 0;
      dailyProfits[record.date] += record.profit;
    });

    const history = Object.entries(dailyProfits)
      .map(([date, profit]) => ({ date, profit }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let cumulative = 0;
    const cumulativeHistory = history.map(item => {
      cumulative += item.profit;
      return { ...item, cumulative };
    });

    return {
      dailyProfits: cumulativeHistory,
      allRecords: (records || []).map(r => ({
        planName: (planMap[r.plan_id] && planMap[r.plan_id].name) || '未知计划',
        planType: planMap[r.plan_id] ? planMap[r.plan_id].type : undefined,
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

// ============ 资金管理 API ============

const fundApi = {
  // 获取资金来源
  getSources: async () => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb
      .from('fund_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // 新增资金来源
  addSource: async (name) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb
      .from('fund_sources')
      .insert({ name, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // 删除资金来源
  deleteSource: async (id) => {
    const sb = getSupabase();
    const { error } = await sb.from('fund_sources').delete().eq('id', id);
    if (error) throw error;
  },

  // 获取某月记录
  getRecords: async (yearMonth) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb
      .from('fund_records')
      .select('*, fund_sources(name)')
      .eq('user_id', user.id)
      .eq('year_month', yearMonth);
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      sourceId: r.source_id,
      sourceName: (r.fund_sources && r.fund_sources.name) || '未知',
      amount: r.amount
    }));
  },

  // 批量保存月度记录（upsert）
  saveRecords: async (yearMonth, records) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const rows = records.map(r => ({
      user_id: user.id,
      source_id: r.sourceId,
      year_month: yearMonth,
      amount: r.amount
    }));
    const { error } = await sb
      .from('fund_records')
      .upsert(rows, { onConflict: 'user_id,source_id,year_month' });
    if (error) throw error;
  },

  // 获取所有历史记录（用于趋势图）
  getAllRecords: async () => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb
      .from('fund_records')
      .select('year_month, amount, source_id, fund_sources(name)')
      .eq('user_id', user.id)
      .order('year_month', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => ({
      yearMonth: r.year_month,
      amount: r.amount,
      sourceId: r.source_id,
      sourceName: (r.fund_sources && r.fund_sources.name) || '未知'
    }));
  },

  // 检查某月是否已记录
  checkMonthRecorded: async (yearMonth) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { count, error } = await sb
      .from('fund_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('year_month', yearMonth);
    if (error) throw error;
    return count > 0;
  },

  // 获取报告
  getReport: async (yearMonth) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb
      .from('fund_reports')
      .select('*')
      .eq('user_id', user.id)
      .eq('year_month', yearMonth)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  // 获取所有报告列表
  getReports: async () => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb
      .from('fund_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('year_month', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // 生成 AI 报告（调用 Edge Function）
  generateReport: async (yearMonth) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb.functions.invoke('generate-fund-report', {
      body: { user_id: user.id, year_month: yearMonth }
    });
    if (error) throw error;
    return data;
  }
};

// 辅助函数
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
