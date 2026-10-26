-- Things the shop owns for its own use (phones, laptops, uniforms,
-- furniture…), as opposed to products it sells.
CREATE SEQUENCE store_item_tag_seq;
CREATE TABLE store_items (
  id text PRIMARY KEY,
  -- The shop's own short code for labelling it: BBA-0001, BBA-0002…
  tag text NOT NULL UNIQUE
    DEFAULT 'BBA-' || lpad(nextval('store_item_tag_seq')::text, 4, '0'),
  name text NOT NULL,
  category text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost numeric(12, 2) CHECK (unit_cost >= 0),
  bought_on date,
  -- Kept when the supplier is removed, so the record still reads correctly.
  supplier_id text REFERENCES suppliers (id) ON DELETE SET NULL,
  supplier_name text,
  serial_number text,
  status text NOT NULL DEFAULT 'in_use'
    CHECK (status IN ('in_use', 'in_storage', 'under_repair', 'lost', 'disposed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Who has how many of an item, e.g. 2 T-shirts with Tolu and 2 with Bisi.
-- Whatever isn't handed out is still with the store.
CREATE TABLE store_item_assignments (
  item_id text NOT NULL REFERENCES store_items (id) ON DELETE CASCADE,
  line integer NOT NULL,
  -- A person, or a place such as "Front counter".
  assigned_to text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (item_id, line)
);
