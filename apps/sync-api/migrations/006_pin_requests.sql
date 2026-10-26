-- Requests can be general (money, stock, repairs…) or a staff member asking
-- for a new PIN, which the admin answers by setting one.
ALTER TABLE store_requests ADD COLUMN kind text NOT NULL DEFAULT 'general'
  CHECK (kind IN ('general', 'pin_reset'));
