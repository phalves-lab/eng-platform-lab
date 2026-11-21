CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 200),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('dev', 'lead', 'admin')),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('write', 'read')),
  target TEXT CHECK (target IS NULL OR length(target) BETWEEN 1 AND 200),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
  status_code INTEGER NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  ip_prefix TEXT CHECK (ip_prefix IS NULL OR length(ip_prefix) BETWEEN 1 AND 64),
  release_run_id BIGINT REFERENCES release_runs (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit_events (actor, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_release_run_idx ON audit_events (release_run_id)
  WHERE release_run_id IS NOT NULL;
