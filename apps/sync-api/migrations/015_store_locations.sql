-- The places store items are kept, picked from a list the admin looks after.
CREATE TABLE store_locations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX store_locations_name_key ON store_locations (lower(name));

-- How an item's quantity splits up, e.g. of 4 laptops, 3 in use at the front
-- counter and 1 in storage in the back office. The rows add up to the item's
-- quantity. Removing a location leaves its items with no location.
CREATE TABLE store_item_lines (
  item_id text NOT NULL REFERENCES store_items (id) ON DELETE CASCADE,
  line integer NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL
    CHECK (status IN ('in_use', 'in_storage', 'under_repair', 'lost', 'disposed')),
  location_id text REFERENCES store_locations (id) ON DELETE SET NULL,
  PRIMARY KEY (item_id, line)
);
CREATE INDEX store_item_lines_location_id_idx ON store_item_lines (location_id);

-- Each existing item becomes one row: all of it has the status it had.
INSERT INTO store_item_lines (item_id, line, quantity, status)
SELECT id, 0, quantity, status FROM store_items;

ALTER TABLE store_items DROP COLUMN status;
