CREATE TABLE IF NOT EXISTS jira_issue_links (
  blocked_key TEXT NOT NULL REFERENCES jira_issues (key) ON DELETE CASCADE,
  blocker_key TEXT NOT NULL REFERENCES jira_issues (key) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocked_key, blocker_key),
  CHECK (blocked_key <> blocker_key)
);

CREATE INDEX IF NOT EXISTS jira_issue_links_blocker_idx ON jira_issue_links (blocker_key);
