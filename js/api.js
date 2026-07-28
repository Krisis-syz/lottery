// API 配置
const API_BASE_URL = 'https://lottery-api.louissyz.workers.dev';

// Supabase 配置（用于登录）
const SUPABASE_URL = 'https://wcstsltmdcmenxkepyzk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjc3RzbHRtZGNtZW54a2VweXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNjI4MTAsImV4cCI6MjEwMDYzODgxMH0.Hx6nJlZwcCyML7DaqDUUNRx-Po6K6bd6At6PeDVWJ5Q';

// 初始化 Supabase 客户端（仅用于登录）
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

// ============ API 请求函数 ============

async function getAuthToken() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token;
}

async function apiRequest(path, options = {}) {
  const token = await getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '请求失败');
  }

  return response.json();
}

// ============ 数据 API ============

const api = {
  // 获取所有计划
  getPlans: async () => {
    const result = await apiRequest('/api/plans');
    return result.plans;
  },

  // 创建计划
  createPlan: async (data) => {
    return apiRequest('/api/plans', {
      method: 'POST',
      body: JSON.stringify({ name: data.name })
    });
  },

  // 获取单个计划
  getPlan: async (id) => {
    const result = await apiRequest(`/api/plans/${id}`);
    return result.plan;
  },

  // 更新计划状态
  updatePlanStatus: async (id) => {
    return apiRequest(`/api/plans/${id}/status`, {
      method: 'PUT'
    });
  },

  // 添加投注记录
  addRecord: async (planId, data) => {
    return apiRequest(`/api/plans/${planId}/records`, {
      method: 'POST',
      body: JSON.stringify({
        date: data.date,
        betAmount: data.betAmount
      })
    });
  },

  // 更新投注结果
  updateRecord: async (planId, recordId, data) => {
    return apiRequest(`/api/plans/${planId}/records/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // 获取汇总数据
  getSummary: async () => {
    const plans = await api.getPlans();
    const records = await api.getHistory();

    let totalInvested = 0;
    let totalReturned = 0;

    plans.forEach(plan => {
      totalInvested += plan.totalInvested;
      totalReturned += plan.totalReturned;
    });

    // 计算昨日汇总
    let yesterdaySummary = null;
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const yesterdayRecords = records.allRecords.filter(r => r.date === yesterdayStr);
    if (yesterdayRecords.length > 0) {
      let invested = 0, returned = 0, profit = 0;
      yesterdayRecords.forEach(r => {
        invested += r.betAmount;
        returned += r.winAmount;
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
    return apiRequest('/api/history');
  }
};
