-- A product's category (Skincare, Hair care…), for sorting and filtering the
-- inventory. Products copied from the website start with the website's.
ALTER TABLE products ADD COLUMN category text;
CREATE INDEX products_category_idx ON products (category);
