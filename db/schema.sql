CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  student_id TEXT NOT NULL UNIQUE,
  major TEXT NOT NULL,
  awards TEXT DEFAULT '',
  internship TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  projects TEXT DEFAULT '',
  contribution TEXT DEFAULT '',
  intent TEXT DEFAULT '',
  company TEXT DEFAULT '',
  salary NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT '待就业',
  source TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS skills TEXT DEFAULT '';
ALTER TABLE students ADD COLUMN IF NOT EXISTS projects TEXT DEFAULT '';
ALTER TABLE students ADD COLUMN IF NOT EXISTS contribution TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS enterprises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  industry TEXT NOT NULL,
  roles TEXT NOT NULL,
  status TEXT NOT NULL,
  needs TEXT DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
