-- Who made each sale (the admin or a staff member), copied in so it still
-- reads correctly after they are renamed or removed. Older sales have none.
ALTER TABLE orders
  ADD COLUMN sold_by_role text CHECK (sold_by_role IN ('admin', 'staff')),
  ADD COLUMN sold_by_name text,
  ADD COLUMN sold_by_staff_id text;
CREATE INDEX orders_sold_by_staff_id_idx ON orders (sold_by_staff_id);
CREATE INDEX activity_log_staff_id_idx ON activity_log (staff_id);
