-- Free gifts (samples, minis, tote bags…) the shop gives away with sales.
-- They have their own stock, kept apart from the products it sells. At the
-- till each sale gets one at random from those in stock at the highest
-- minimum spend it reaches.
CREATE TABLE gifts (
  id text PRIMARY KEY,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  -- What one cost the shop, when known.
  unit_cost numeric(12, 2) CHECK (unit_cost >= 0),
  -- The smallest sale total that can get it. Without one, the gift is only
  -- given by hand in the back office.
  min_spend numeric(12, 2) CHECK (min_spend >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The gifts given with each sale. Like sale items, each keeps its own copy
-- of the gift's name and cost, and outlives the gift being removed.
CREATE TABLE order_gifts (
  order_id text NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  line integer NOT NULL,
  gift_id text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(12, 2),
  PRIMARY KEY (order_id, line)
);
CREATE INDEX order_gifts_gift_id_idx ON order_gifts (gift_id);
