ALTER TABLE campaign_requests
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL
  CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 10 AND 500);
