CREATE TABLE IF NOT EXISTS metric_snapshots (
  dataset TEXT NOT NULL CHECK (dataset ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  day DATE NOT NULL,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset, day)
);
