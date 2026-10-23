-- Products, with how many are in stock.
CREATE TABLE products (
  id text PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  cost_price numeric(12, 2) CHECK (cost_price >= 0),
  barcode text UNIQUE,
  image_url text,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  -- clock_timestamp() so products added together keep their order.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Customers are matched by phone number with spaces removed.
CREATE TABLE customers (
  phone_key text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Each sale keeps its own copy of the customer and of every item's name and
-- prices, so later edits to products or customers don't change past sales.
CREATE TABLE orders (
  id text PRIMARY KEY,
  total numeric(12, 2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('transfer', 'card')),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  created_at timestamptz NOT NULL
);
CREATE INDEX orders_created_at_idx ON orders (created_at);

CREATE TABLE order_items (
  order_id text NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  line integer NOT NULL,
  -- No foreign key: a sale outlives the product it sold.
  product_id text NOT NULL,
  name text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL,
  unit_cost numeric(12, 2),
  PRIMARY KEY (order_id, line)
);

CREATE TABLE cashiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  salt text NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
