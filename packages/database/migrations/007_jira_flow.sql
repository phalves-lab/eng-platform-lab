ALTER TABLE jira_issues ADD COLUMN IF NOT EXISTS summary TEXT NULL;
ALTER TABLE jira_issues ADD COLUMN IF NOT EXISTS url TEXT NULL CHECK (url IS NULL OR url ~ '^https://');

CREATE INDEX IF NOT EXISTS jira_issues_epic_idx ON jira_issues (epic_key);

CREATE TABLE IF NOT EXISTS jira_sprint_issues (
  sprint_id BIGINT NOT NULL REFERENCES jira_sprints (id) ON DELETE CASCADE,
  issue_key TEXT NOT NULL REFERENCES jira_issues (key) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NULL,
  PRIMARY KEY (sprint_id, issue_key)
);

CREATE INDEX IF NOT EXISTS jira_sprint_issues_issue_idx ON jira_sprint_issues (issue_key);
