-- Who the shop buys a product from. Removing the supplier leaves the
-- product without one.
ALTER TABLE products
  ADD COLUMN supplier_id text REFERENCES suppliers (id) ON DELETE SET NULL;
CREATE INDEX products_supplier_idx ON products (supplier_id);
