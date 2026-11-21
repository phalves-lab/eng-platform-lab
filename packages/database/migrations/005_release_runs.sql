CREATE TABLE IF NOT EXISTS release_runs (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL CHECK (project_id ~ '^[a-z0-9][a-z0-9-]*$'),
  action TEXT NOT NULL CHECK (action IN ('release', 'publish')),
  actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 200),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('dev', 'lead', 'admin')),
  plan_hash TEXT NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  plan JSONB NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'rejected')),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS release_runs_project_created_idx ON release_runs (project_id, created_at DESC, id DESC);
