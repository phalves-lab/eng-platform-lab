CREATE TABLE IF NOT EXISTS ai_eval_runs (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9._:-]{8,200}$'),
  suite TEXT NOT NULL CHECK (suite IN ('bot', 'chat')),
  run_at TIMESTAMPTZ NOT NULL,
  commit_sha TEXT NOT NULL CHECK (commit_sha ~ '^([0-9a-f]{7,40}|desconhecido)$'),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 200),
  offline BOOLEAN NOT NULL DEFAULT false,
  total INTEGER NOT NULL CHECK (total >= 0),
  passed INTEGER NOT NULL CHECK (passed >= 0 AND passed <= total),
  input_tokens INTEGER NULL CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER NULL CHECK (output_tokens IS NULL OR output_tokens >= 0),
  latency_p50_ms INTEGER NULL CHECK (latency_p50_ms IS NULL OR latency_p50_ms >= 0),
  latency_max_ms INTEGER NULL CHECK (latency_max_ms IS NULL OR latency_max_ms >= 0),
  cases JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(cases) = 'array'),
  source TEXT NOT NULL CHECK (source IN ('local', 'fixture', 'github')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((latency_p50_ms IS NULL) = (latency_max_ms IS NULL))
);

CREATE INDEX IF NOT EXISTS ai_eval_runs_suite_run_at_idx ON ai_eval_runs (suite, run_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_records (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9._:-]{8,200}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('bot', 'chat', 'golden-set')),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  cost_usd NUMERIC(14, 6) NULL CHECK (cost_usd IS NULL OR cost_usd >= 0),
  pricing_version TEXT NULL,
  team TEXT NULL CHECK (team IS NULL OR length(team) BETWEEN 1 AND 200),
  skill TEXT NULL CHECK (skill IS NULL OR length(skill) BETWEEN 1 AND 200),
  repository TEXT NULL CHECK (repository IS NULL OR repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  pull_request INTEGER NULL CHECK (pull_request IS NULL OR pull_request > 0),
  run_id TEXT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cost_usd IS NULL OR pricing_version IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ai_usage_records_occurred_at_idx ON ai_usage_records (occurred_at DESC);
