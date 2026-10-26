-- Who the shop buys from.
CREATE TABLE suppliers (
  id text PRIMARY KEY,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  -- What they supply, account details, terms and so on.
  notes text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Money spent by the shop: stock bought, rent, transport and so on.
CREATE TABLE expenses (
  id text PRIMARY KEY,
  spent_on date NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'card')),
  -- Kept when the supplier is removed, so the record still reads correctly.
  supplier_id text REFERENCES suppliers (id) ON DELETE SET NULL,
  supplier_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX expenses_spent_on_idx ON expenses (spent_on);

-- Official requests made in the store (money, items, time off, repairs),
-- with the admin's decision.
CREATE TABLE store_requests (
  id text PRIMARY KEY,
  title text NOT NULL,
  details text,
  requested_by text NOT NULL,
  -- The staff member who made it, so they can follow it; null for the admin.
  requested_by_staff_id text,
  amount numeric(12, 2) CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'done')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
