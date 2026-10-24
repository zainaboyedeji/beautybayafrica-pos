-- The online shop's id for products and options copied from it. Their
-- selling price is set on the website and kept in step by the sync.
ALTER TABLE products ADD COLUMN wc_id integer UNIQUE;
ALTER TABLE product_variants ADD COLUMN wc_id integer UNIQUE;

-- When the nightly full copy from the website last finished (one row).
CREATE TABLE woocommerce_sync (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_full_sync timestamptz NOT NULL
);
