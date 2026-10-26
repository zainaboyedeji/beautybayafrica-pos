import { db, transaction } from "./db";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Customer, Order, Product } from "@pos/types";

// One-off copy of the JSON files the server used to save (data/*.json) into
// Postgres. Safe to run again: records already in the database are skipped.
const dataDir = path.resolve(process.env.DATA_DIR ?? "data");

const read = <T>(file: string): T[] => {
  const full = path.join(dataDir, file);
  return existsSync(full) ? JSON.parse(readFileSync(full, "utf8")) : [];
};

const phoneKey = (phone: string) => phone.replace(/\s+/g, "");

async function main() {
  const catalog = read<Product & { quantity: number }>("catalog.json");
  const orders = read<Order>("orders.json");
  const customers = read<Customer>("customers.json");
  const staff = read<{ id: string; name: string; salt: string; pinHash: string }>(
    "staff.json",
  );

  const counts = await transaction(async (client) => {
    let products = 0;
    for (const p of catalog) {
      const { rowCount } = await client.query(
        `INSERT INTO products (id, sku, name, price, cost_price, barcode, image_url, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
        [
          p.id,
          p.sku,
          p.name,
          p.price,
          p.costPrice ?? null,
          p.barcode ?? null,
          p.imageUrl ?? null,
          p.quantity,
        ],
      );
      products += rowCount ?? 0;
    }

    let sales = 0;
    for (const o of orders) {
      const { rowCount } = await client.query(
        `INSERT INTO orders (id, total, payment_method, customer_name, customer_phone, customer_email, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [
          o.id,
          o.total,
          o.paymentMethod,
          o.customer.name,
          o.customer.phone,
          o.customer.email || null,
          o.createdAt,
        ],
      );
      if (!rowCount) continue;
      sales++;
      for (const [line, item] of o.items.entries()) {
        await client.query(
          `INSERT INTO order_items (order_id, line, product_id, name, quantity, unit_price, unit_cost)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            o.id,
            line,
            item.productId,
            item.name ?? null,
            item.quantity,
            item.unitPrice,
            item.unitCost ?? null,
          ],
        );
      }
    }

    // Saved customers first, then anyone who only appears on a sale.
    let savedCustomers = 0;
    for (const c of [...customers, ...orders.map((o) => o.customer)]) {
      const { rowCount } = await client.query(
        `INSERT INTO customers (phone_key, name, phone, email) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [phoneKey(c.phone), c.name, c.phone, c.email || null],
      );
      savedCustomers += rowCount ?? 0;
    }

    let savedStaff = 0;
    for (const m of staff) {
      const { rowCount } = await client.query(
        `INSERT INTO staff (id, name, salt, pin_hash) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [m.id, m.name, m.salt, m.pinHash],
      );
      savedStaff += rowCount ?? 0;
    }
    return { products, sales, customers: savedCustomers, staff: savedStaff };
  });

  console.log(
    `Copied ${counts.products} products, ${counts.sales} sales, ` +
      `${counts.customers} customers and ${counts.staff} staff from ${dataDir}.`,
  );
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
