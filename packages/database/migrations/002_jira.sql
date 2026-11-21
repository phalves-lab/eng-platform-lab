CREATE TABLE IF NOT EXISTS jira_sprints (
  id BIGINT PRIMARY KEY,
  project TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('future', 'active', 'closed')),
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at),
  CHECK (state <> 'closed' OR completed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS jira_issues (
  key TEXT PRIMARY KEY CHECK (key ~ '^[A-Z][A-Z0-9]+-[0-9]+$'),
  project TEXT NOT NULL,
  component TEXT NULL,
  issue_type TEXT NOT NULL,
  status TEXT NOT NULL,
  epic_key TEXT NULL CHECK (epic_key IS NULL OR epic_key ~ '^[A-Z][A-Z0-9]+-[0-9]+$'),
  sprint_id BIGINT NULL REFERENCES jira_sprints (id),
  assignee TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (split_part(key, '-', 1) = project),
  CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

CREATE INDEX IF NOT EXISTS jira_issues_project_resolved_idx ON jira_issues (project, resolved_at);
CREATE INDEX IF NOT EXISTS jira_issues_sprint_idx ON jira_issues (sprint_id);

CREATE TABLE IF NOT EXISTS jira_status_changes (
  id BIGSERIAL PRIMARY KEY,
  issue_key TEXT NOT NULL REFERENCES jira_issues (key) ON DELETE CASCADE,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL,
  CHECK (from_status IS DISTINCT FROM to_status),
  UNIQUE (issue_key, changed_at, to_status)
);
