-- Options of a product (shade, size, …), each with its own price and stock.
-- A product with options keeps quantity 0; its stock is the options' total.
-- Name and SKU checks wait until commit, so options can swap names or SKUs
-- in one edit.
CREATE TABLE product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text NOT NULL UNIQUE DEFERRABLE INITIALLY DEFERRED,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  cost_price numeric(12, 2) CHECK (cost_price >= 0),
  barcode text UNIQUE DEFERRABLE INITIALLY DEFERRED,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  position integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX product_variants_product_idx ON product_variants (product_id, position);

-- Which option a sale line was for. No foreign key, like product_id.
ALTER TABLE order_items ADD COLUMN variant_id text;
