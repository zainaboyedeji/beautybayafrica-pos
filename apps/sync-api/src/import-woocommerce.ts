import { transaction } from "./db";
import { randomUUID } from "node:crypto";

// Copies the online shop's products (names, prices, photos and options) from
// WooCommerce's public Store API into the POS. Safe to run again: products
// are matched by SKU and updated, and stock and cost prices set in the POS
// are left alone. New products start with 0 in stock.
//
// The public API doesn't show stock counts, so set those in the back office.
const SHOP_URL = process.env.WOOCOMMERCE_URL ?? "https://beautybayafrica.com";

type StoreItem = {
  id: number;
  parent: number;
  type: string;
  name: string;
  sku: string;
  /** For options, e.g. "Brand: Anua, Size: 250ml". */
  variation: string;
  prices: { price: string; currency_minor_unit: number };
  images: { src: string }[];
  brands?: { name: string }[];
  attributes: { name: string; terms?: { name: string }[] }[];
};

async function fetchAll(query: string): Promise<StoreItem[]> {
  const items: StoreItem[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${SHOP_URL}/wp-json/wc/store/v1/products?${query}&per_page=100&page=${page}&orderby=id&order=asc`,
    );
    if (!res.ok) throw new Error(`Shop answered ${res.status} for ${query} page ${page}`);
    items.push(...((await res.json()) as StoreItem[]));
    if (page >= Number(res.headers.get("x-wp-totalpages") ?? 1)) return items;
  }
}

// Store API text is HTML-escaped ("Calm &#038; Renew").
const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => NAMED[name] ?? m)
    .trim();

const priceOf = (item: StoreItem) =>
  Number(item.prices.price) / 10 ** item.prices.currency_minor_unit;

// The POS only accepts Cloudinary photos, which is where the shop keeps them.
const imageOf = (item: StoreItem) => {
  const src = item.images[0]?.src;
  return src?.startsWith("https://res.cloudinary.com/") ? src : null;
};

const brandOf = (item: StoreItem) =>
  decode(
    item.brands?.[0]?.name ??
      item.attributes.find((a) => a.name === "Brand")?.terms?.[0]?.name ??
      "",
  );

/** Cashiers search by brand, so put it in front unless the name has it. */
const productName = (item: StoreItem) => {
  const name = decode(item.name);
  const brand = brandOf(item);
  return brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${brand} ${name}`
    : name;
};

/** "Brand: Nuban Beauty, Shades: 41" → "Shade 41"; "Size: 250ml" → "250ml". */
const optionName = (variation: string) =>
  decode(variation)
    .split(", ")
    .map((part) => part.split(": "))
    .filter(([attribute]) => attribute !== "Brand")
    .map(([attribute, value = ""]) =>
      /^\d+(\.\d+)?$/.test(value)
        ? `${attribute.replace(/s$/, "")} ${value}`
        : value,
    )
    .join(" / ");

const byNumber = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

async function main() {
  const [products, variations] = await Promise.all([
    fetchAll("type=simple"),
    fetchAll("type=variable"),
  ]).then(async ([simple, variable]) => [
    [...simple, ...variable].sort((a, b) => a.id - b.id),
    await fetchAll("type=variation"),
  ]);
  console.log(
    `Shop has ${products.length} products and ${variations.length} options.`,
  );

  // SKUs must be unique across products and options. Items without one, or
  // whose SKU is already taken, use their WooCommerce id instead.
  const used = new Set<string>();
  const skuOf = (item: StoreItem) => {
    const sku = item.sku.trim();
    const chosen = sku && !used.has(sku) ? sku : `WC-${item.id}`;
    used.add(chosen);
    return chosen;
  };

  const skipped: string[] = [];
  const counts = await transaction(async (client) => {
    let added = 0;
    let updated = 0;
    let options = 0;
    for (const item of products) {
      const name = productName(item);
      const sku = skuOf(item);
      const opts =
        item.type === "variable"
          ? variations
              .filter((v) => v.parent === item.id)
              .flatMap((v) => {
                const price = priceOf(v);
                if (!(price > 0)) {
                  skipped.push(`${name} — ${optionName(v.variation)} (no price)`);
                  return [];
                }
                return [{ name: optionName(v.variation) || `Option ${v.id}`, sku: skuOf(v), price }];
              })
          : [];
      // Shade 5.5 before Shade 06, 42 before 42.5 before 43.
      opts.sort((a, b) => byNumber.compare(a.name, b.name));
      // Option names must differ within a product.
      for (const opt of opts)
        if (opts.filter((o) => o.name === opt.name).length > 1)
          opt.name = `${opt.name} (${opt.sku})`;

      if (item.type === "variable" && opts.length === 0) {
        skipped.push(`${name} (no options with a price)`);
        continue;
      }
      const price = opts.length
        ? Math.min(...opts.map((o) => o.price))
        : priceOf(item);
      if (!opts.length && !(price > 0)) {
        skipped.push(`${name} (no price)`);
        continue;
      }

      const { rows } = await client.query<{ id: string; inserted: boolean }>(
        `INSERT INTO products (id, sku, name, price, image_url, quantity)
         VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name,
           price = EXCLUDED.price,
           image_url = COALESCE(EXCLUDED.image_url, products.image_url),
           updated_at = now()
         RETURNING id, (xmax = 0) AS inserted`,
        [randomUUID(), sku, name, price, imageOf(item)],
      );
      const productId = rows[0].id;
      if (rows[0].inserted) added++;
      else updated++;

      // Options are matched by SKU; their stock and cost stay as they are.
      for (const [position, opt] of opts.entries()) {
        const { rowCount } = await client.query(
          `UPDATE product_variants SET name = $3, price = $4, position = $5,
             updated_at = now()
           WHERE product_id = $1 AND sku = $2`,
          [productId, opt.sku, opt.name, opt.price, position],
        );
        if (!rowCount)
          await client.query(
            `INSERT INTO product_variants (id, product_id, name, sku, price, quantity, position)
             VALUES ($1, $2, $3, $4, $5, 0, $6)`,
            [randomUUID(), productId, opt.name, opt.sku, opt.price, position],
          );
        options++;
      }
    }
    return { added, updated, options };
  });

  console.log(
    `Added ${counts.added} and updated ${counts.updated} products, with ${counts.options} options.`,
  );
  if (skipped.length)
    console.log(`Skipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
