-- 在 Supabase SQL Editor 中执行此语句
-- 创建 plan_reports 表用于存储 AI 投注报告

CREATE TABLE IF NOT EXISTS plan_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  report_text TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, year_month)
);

-- 启用 RLS
ALTER TABLE plan_reports ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的报告
CREATE POLICY "Users can view own reports" ON plan_reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports" ON plan_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports" ON plan_reports
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports" ON plan_reports
  FOR DELETE USING (auth.uid() = user_id);
