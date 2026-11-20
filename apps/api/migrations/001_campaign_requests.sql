CREATE TABLE IF NOT EXISTS campaign_requests (
  id UUID PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  requester_id TEXT NOT NULL,
  business_unit TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'paid_media')),
  budget_cents BIGINT NOT NULL CHECK (budget_cents >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL,
  approvals TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
