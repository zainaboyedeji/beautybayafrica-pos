-- Whether a sale happened in the shop ("offline") or online. Till sales are
-- always offline; the admin chooses when recording one. Older sales are
-- treated as offline.
ALTER TABLE orders
  ADD COLUMN channel text NOT NULL DEFAULT 'offline'
    CHECK (channel IN ('online', 'offline'));
