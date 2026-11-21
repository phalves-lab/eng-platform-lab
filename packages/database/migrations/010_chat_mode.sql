ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'ask'
  CHECK (chat_mode ~ '^[a-z]+(-[a-z]+)*$' AND length(chat_mode) <= 40);
