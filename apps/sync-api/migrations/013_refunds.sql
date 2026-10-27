-- A refunded sale stays on record but no longer counts in any totals, and
-- its items go back into stock. Only a whole sale can be refunded.
ALTER TABLE orders
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN refunded_by_name text,
  ADD COLUMN refund_reason text;
