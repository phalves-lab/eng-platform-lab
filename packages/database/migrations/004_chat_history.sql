CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL CHECK (length(owner) BETWEEN 1 AND 200),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS chat_conversations_owner_updated_idx
  ON chat_conversations (owner, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_conversations_updated_idx ON chat_conversations (updated_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
  mode TEXT NULL CHECK (mode IN ('llm', 'retrieval')),
  tools JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tools) = 'array'),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((author = 'user') = (mode IS NULL)),
  CHECK (author = 'assistant' OR (tools = '[]'::jsonb AND sources = '[]'::jsonb)),
  CHECK (content !~* '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z0-9.-]+'),
  CHECK (content !~ '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}')
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages (conversation_id, id);
