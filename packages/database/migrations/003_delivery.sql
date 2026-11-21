CREATE TABLE IF NOT EXISTS deploys (
  id BIGSERIAL PRIMARY KEY,
  repo TEXT NOT NULL CHECK (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  environment TEXT NOT NULL,
  sha TEXT NOT NULL CHECK (sha ~ '^[0-9a-f]{7,40}$'),
  deployed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'rolled_back')),
  UNIQUE (repo, environment, sha, deployed_at)
);

CREATE INDEX IF NOT EXISTS deploys_repo_environment_idx ON deploys (repo, environment, deployed_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  system TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3', 'sev4')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS incidents_system_started_idx ON incidents (system, started_at DESC);
