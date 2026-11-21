ALTER TABLE deploys ADD COLUMN IF NOT EXISTS url TEXT NULL;
ALTER TABLE deploys ADD COLUMN IF NOT EXISTS commit_shas TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS title TEXT NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS cause_repo TEXT NULL
  CHECK (cause_repo IS NULL OR cause_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS cause_sha TEXT NULL
  CHECK (cause_sha IS NULL OR cause_sha ~ '^[0-9a-f]{7,40}$');
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incidents_cause_pair_check' AND conrelid = 'incidents'::regclass
  ) THEN
    ALTER TABLE incidents ADD CONSTRAINT incidents_cause_pair_check
      CHECK ((cause_repo IS NULL) = (cause_sha IS NULL));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS delivery_changes (
  repo TEXT NOT NULL CHECK (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  pull_number INTEGER NOT NULL CHECK (pull_number > 0),
  title TEXT NOT NULL DEFAULT '',
  merge_sha TEXT NOT NULL CHECK (merge_sha ~ '^[0-9a-f]{7,40}$'),
  first_commit_at TIMESTAMPTZ NOT NULL,
  merged_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (repo, pull_number)
);

CREATE INDEX IF NOT EXISTS delivery_changes_repo_merged_idx ON delivery_changes (repo, merged_at DESC);
