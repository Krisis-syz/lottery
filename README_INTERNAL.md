# 体彩投资计划 - 内部上手指南

> 当前版本：v1.1.1 | GitHub 仓库：Krisis-syz/lottery | 部署地址：https://krisis-syz.github.io/lottery/

---

## 一、项目概述

一个纯前端的体彩投注管理系统，用于追踪多个投资计划的每日投注记录、盈亏统计和 AI 分析报告。无任何构建工具，直接 HTML/CSS/JS 开发，部署在 GitHub Pages 上。

---

## 二、技术栈

| 层面 | 技术 | 说明 |
|------|------|------|
| 前端 | 纯 HTML + CSS + JS | 无框架、无打包工具，直接静态文件 |
| UI 字体 | Outfit（UI 文字） + JetBrains Mono（数字） | Google Fonts CDN |
| 图表 | Chart.js 3.x（CDN） + 自绘 Canvas | `history.html` 和 `plan.html` 用 Chart.js，AI 报告用手写 Canvas |
| 认证 | Supabase Auth | 邮箱 + 密码注册/登录 |
| 数据库 | Supabase PostgreSQL | 直接前端连 Supabase，无自建后端 |
| Edge Function | Supabase Edge Function | `generate-report` —— AI 投注报告生成 |
| 部署 | GitHub Pages | 静态资源托管在 GitHub Pages 上 |
| 主题 | CSS 变量 + `data-theme` 属性 | 深色 / 浅色双主题，localStorage 持久化 |

---

## 三、Supabase 配置

**项目地址**：`https://supabase.com/dashboard/project/wcstsltmdcmenxkepyzk`

**前端直连配置**（`js/api.js` 开头）：

```javascript
const SUPABASE_URL = 'https://wcstsltmdcmenxkepyzk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // anon key
```

**数据库表结构**（需在 Supabase Dashboard → Table Editor 中确认）：

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `plans` | 投资计划 | `id`, `name`, `type`(normal/martingale), `status`(active/paused), `user_id`, `created_at` |
| `records` | 投注记录 | `id`, `plan_id`, `date`, `bet_amount`, `result`(win/lose/null), `win_amount`, `profit`, `multiplier`, `user_id` |
| `fund_sources` | 资金来源 | `id`, `name`, `user_id`, `type`(流动/基金/股票) |
| `fund_records` | 资金月度记录 | `id`, `source_id`, `year_month`, `amount`, `user_id`，唯一约束 `(user_id, source_id, year_month)` |
| `fund_reports` | 资金报告 | `id`, `user_id`, `year_month`, `report_text` |
| `plan_reports` | AI 投注报告 | `id`, `user_id`, `year_month`, `report_text`, `status`, `updated_at`，唯一约束 `(user_id, year_month)` |

**Edge Functions**（Supabase Dashboard → Edge Functions）：

| 函数名 | 用途 |
|--------|------|
| `generate-report` | 接收 `{ prompt }`，调用外部 AI API 生成报告文本并返回 |

**RLS 策略**：每张表按 `user_id` 隔离数据，前端 anon key 配合 RLS 实现多用户隔离。

---

## 四、LLM 配置

AI 投注报告功能通过 Supabase Edge Function `generate-report` 实现：

1. 前端在 `js/ai-report.js` 的 `collectReportData()` 中收集本月+上月投注数据
2. `buildAIPrompt()` 构造一个结构化的分析 prompt，包含每日数据表、分计划明细等
3. 通过 `fetch()` 调用 Edge Function URL：`https://wcstsltmdcmenxkepyzk.supabase.co/functions/v1/generate-report`
4. 传递 Supabase auth token 做鉴权
5. Edge Function 内部调用外部 LLM API（具体 key 配置在 Supabase 的 Edge Function Secrets 中）
6. 返回 Markdown 格式报告文本，前端解析渲染（含内联图表）

**Prompt 设计要点**（`js/ai-report.js` 第 236-342 行）：
- 报告结构固定为 4 章：总览、分计划分析、风险识别、月度总结
- 盈利用红色（`#ef4444`），亏损用绿色（`#10b981`）—— 符合中国市场习惯
- AI 需在文中插入 `[chart:trend]`、`[chart:calendar]`、`[chart:treemap]` 标记，前端自动渲染图表
- 核心指标格式：用 `|` 分隔的横排标签卡片

---

## 五、GitHub 仓库信息

```
远程仓库：https://github.com/Krisis-syz/lottery.git
推送主体：Krisis-syz
分支策略：main 分支开发，gh-pages 分支部署
部署方式：GitHub Pages（Settings → Pages → gh-pages 分支）
```

---

## 六、本地开发

**前置要求**：无需 Node.js，直接用浏览器打开 HTML 文件即可。

```bash
# 克隆仓库
git clone https://github.com/Krisis-syz/lottery.git
cd lottery

# 本地启动（任选一种）
# 方式1：Python
python -m http.server 8080

# 方式2：Node.js
npx serve .

# 方式3：直接浏览器打开
# 双击 index.html（注意：部分 API 调用可能需要 HTTP 服务器）
```

访问 `http://localhost:8080` 即可。

**注意**：Supabase SDK 通过 `<script src="js/supabase.min.js">` 加载（已包含在仓库中），无需 npm install。

---

## 七、部署到 GitHub Pages

项目已从 Cloudflare Workers 全面迁移到 GitHub Pages。`wrangler.jsonc` 是旧部署方式的遗留文件，可忽略。

**部署流程**：

```bash
# 推送 main 分支代码
git push origin main

# 如果需要强制更新 gh-pages 分支
git push origin main:gh-pages --force
```

**配置要点**：
- GitHub 仓库 Settings → Pages → Source 选择 `gh-pages` 分支
- 部署地址：`https://krisis-syz.github.io/lottery/`
- 项目结构已针对 GitHub Pages 做过兼容性重构（commit: `6adbdcc`）
- `.gitignore` 中排除了 `README.md`（GitHub Pages 不需要此文件）

---

## 八、页面结构与功能

```
├── login.html      登录/注册页
├── index.html      主页 —— 总览卡片 + 进行中计划列表
├── plans.html      所有计划页 —— 含暂停状态的计划
├── plan.html       计划详情 —— 投注记录表格 + 图表 + 日历
├── history.html    历史记录 —— 总净收益折线图 + 收益日历 + 明细表格
├── ai-report.html  AI 投注报告 —— 月度报告生成 + 历史报告列表
├── calculator.html 跟单计算器 —— 基于连续亏损计算回本投注额
├── profile.html    个人中心 —— 用户信息 + 深色模式 + 版本信息
├── css/style.css   全局样式（CSS 变量主题系统）
├── js/
│   ├── api.js           Supabase 初始化 + Auth + 数据 API（api / fundApi）
│   ├── index.js         主页逻辑
│   ├── plans.js         计划列表逻辑
│   ├── plan.js          计划详情逻辑（含图表 + 日历 + 长按菜单）
│   ├── history.js       历史记录逻辑（折线图 + 日历 + 明细）
│   ├── ai-report.js     AI 投注报告（数据收集 + prompt 构建 + 渲染）
│   ├── funds.js         资产管理逻辑（资金来源 + 月度记录）
│   └── supabase.min.js  Supabase JS SDK（本地拷贝）
└── icon.png             应用图标
```

---

## 九、核心 API 接口（`js/api.js`）

### 认证函数

| 函数 | 说明 |
|------|------|
| `getCurrentUser()` | 获取当前登录用户 |
| `signUp(email, password)` | 注册，返回 `{ needsConfirmation }` |
| `signIn(email, password)` | 登录 |
| `signOut()` | 退出登录，跳转 login.html |
| `requireAuth()` | 检查登录，未登录则跳转登录页 |

### 投注数据 API（`api.*`）

| 方法 | 说明 |
|------|------|
| `api.getPlans()` | 获取所有计划 + 汇总（总投入/总回收/昨日数据/连亏数） |
| `api.createPlan({ name })` | 创建新计划 |
| `api.getPlan(id)` | 获取单个计划 + 全部投注记录 |
| `api.updatePlanStatus(id)` | 切换计划 active/paused |
| `api.addRecord(planId, { date, betAmount })` | 添加投注记录 |
| `api.updateRecord(planId, recordId, data)` | 更新记录（结果/金额） |
| `api.getSummary()` | 获取全局汇总数据 |
| `api.getHistory()` | 获取历史（每日累计收益 + 全部记录） |

### 资金管理 API（`fundApi.*`）

| 方法 | 说明 |
|------|------|
| `fundApi.getSources()` | 获取资金来源列表 |
| `fundApi.addSource(name)` | 新增资金来源 |
| `fundApi.deleteSource(id)` | 删除资金来源 |
| `fundApi.getRecords(yearMonth)` | 获取某月记录 |
| `fundApi.saveRecords(yearMonth, records)` | 批量保存月度记录（upsert） |
| `fundApi.getAllRecords()` | 获取所有历史记录（趋势图用） |
| `fundApi.getReport(yearMonth)` | 获取报告 |
| `fundApi.getReports()` | 获取报告列表 |
| `fundApi.generateReport(yearMonth)` | 调用 Edge Function 生成 AI 报告 |

---

## 十、关键业务逻辑

### 盈亏计算
- `profit = win_amount - bet_amount`
- `win_amount`：中奖时填入，未中时为 0
- `result` 字段：`win` / `lose` / `null`（未结算）

### 连亏计算（`js/ai-report.js`）
- 按日期正序遍历，当天所有记录都为 `lose` 才算连亏一天
- 支持跨月连亏追溯（检查上月最后一天）

### 跟单计算器（`calculator.html`）
- 选择计划 → 自动统计最近连续未中天数和累计本金
- 输入赔率和目标回本金额
- 公式：`回本投注 = 累计亏损 / (赔率 - 1)`，结果向上取整到偶数

### 收益日历（`history.html` + `plan.html`）
- 三级视图：年（3年概览）→ 月（12月概览）→ 日（月度日历）
- 点击年/月可下钻到更细粒度
- 颜色编码：红色 = 盈利，绿色 = 亏损

### 图表渲染
- `history.html` 和 `plan.html` 的趋势图：Chart.js 折线图
- AI 报告内图表：手写 Canvas 渲染
  - 趋势图：贝塞尔曲线平滑折线 + 渐变填充
  - 日历热力图：CSS Grid + 颜色强度映射
  - 柱状图：正负双向水平柱状图

### 主题系统
- CSS 变量定义在 `:root`（深色）和 `[data-theme="light"]`（浅色）
- 默认深色主题，`localStorage` 存储用户偏好
- 切换时修改 `document.documentElement` 的 `data-theme` 属性

### 长按上下文菜单（`plan.html`）
- 移动端：touchstart 500ms 长按触发
- 桌面端：右键菜单触发
- 功能：修改投注金额、填写/修改投注结果

---

## 十一、颜色规范

> 注意：本项目中红色代表盈利/赢，绿色代表亏损/输，符合中国市场习惯。

| 场景 | 颜色 | CSS 变量/值 |
|------|------|------------|
| 盈利/赢 | 红色 | `#ef4444` / `var(--success)` |
| 亏损/输 | 绿色 | `#10b981` / `var(--danger)` |
| 主题色 | 金色 | `#f59e0b` / `var(--gold)` |
| 背景 | 深色 | `#0a0e17` / `var(--bg-primary)` |

---

## 十二、环境变量与安全

- `.env` 和 `.dev.vars` 已在 `.gitignore` 中排除
- `wrangler.jsonc` 是 Cloudflare Workers 遗留文件，当前部署已迁移到 GitHub Pages，可安全忽略
- Supabase anon key 前端可见（设计如此，靠 RLS 隔离数据）
- AI 报告的 LLM API Key 存储在 Supabase Edge Function Secrets 中，不暴露给前端
- GitHub Personal Access Token 仅用于本地 git push，不入库

---

## 十三、版本历史

| 版本 | 日期 | 内容 |
|------|------|------|
| v1.1.1 | 2026-07-31 | 修复 AI 报告 Markdown 解析 bug，重写解析器 |
| v1.1.0 | 2026-07-31 | 新增 AI 投注报告功能（趋势图、日历图、柱状图） |
| v1.0.1 | 2026-07-28 | 新增跟单计算器，连续亏损逻辑优化，UI 颜色优化 |
| v1.0.0 | 2026-07-26 | 初始版本：投资计划管理、投注记录追踪、收益历史、主题切换 |
