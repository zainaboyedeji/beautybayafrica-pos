import { db, transaction } from "./db";
import { randomUUID } from "node:crypto";

// Copies the online shop's products from WooCommerce's public Store API:
// names, selling prices, photos and options. Stock, cost prices, barcodes
// and SKUs belong to the POS and are never changed here. Products are
// matched by their WooCommerce id (or SKU, the first time).
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

// Requests go one at a time with a pause between them, to stay light on
// the website.
const pause = () => new Promise((resolve) => setTimeout(resolve, 1_000));

async function fetchAll(query: string): Promise<StoreItem[]> {
  const items: StoreItem[] = [];
  for (let page = 1; ; page++) {
    if (page > 1) await pause();
    const res = await fetch(
      `${SHOP_URL}/wp-json/wc/store/v1/products?${query}&per_page=100&page=${page}&orderby=id&order=asc`,
      { signal: AbortSignal.timeout(60_000) },
    );
    if (!res.ok)
      throw new Error(`Shop answered ${res.status} for ${query} page ${page}`);
    items.push(...((await res.json()) as StoreItem[]));
    if (page >= Number(res.headers.get("x-wp-totalpages") ?? 1)) return items;
  }
}

// Store API text is HTML-escaped ("Calm &#038; Renew").
const NAMED: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};
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

/** Staff search by brand, so put it in front unless the name has it. */
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

// Shade 5.5 before Shade 06, 42 before 42.5 before 43.
const byNumber = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

type ExistingProduct = {
  id: string;
  wc_id: number | null;
  linked: boolean;
  sku: string;
  name: string;
  price: number;
  image_url: string | null;
};
type ExistingVariant = {
  id: string;
  product_id: string;
  wc_id: number | null;
  linked: boolean;
  sku: string;
  name: string;
  price: number;
  position: number;
};

export type SyncResult = {
  added: number;
  updated: number;
  unchanged: number;
  /** Website items left out, with the reason. */
  skipped: string[];
};

/** Fetches every product and option from the shop and copies them in. */
export async function syncFromWooCommerce(): Promise<SyncResult> {
  const simple = await fetchAll("type=simple");
  await pause();
  const variable = await fetchAll("type=variable");
  await pause();
  const variations = await fetchAll("type=variation");
  return applyItems([...simple, ...variable], variations);
}

/**
 * Copies in one product (and its options) right after it changes on the
 * website. `wcId` may be an option's id; its product is refreshed.
 */
export async function syncOneProduct(wcId: number): Promise<SyncResult | null> {
  const res = await fetch(`${SHOP_URL}/wp-json/wc/store/v1/products/${wcId}`, {
    signal: AbortSignal.timeout(60_000),
  });
  // Drafts, private and deleted products aren't for sale; leave them.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Shop answered ${res.status} for product ${wcId}`);
  const item = (await res.json()) as StoreItem;
  if (item.parent) return syncOneProduct(item.parent);
  if (item.type !== "simple" && item.type !== "variable") return null;
  const variations =
    item.type === "variable" ? await fetchAll(`type=variation&parent=${item.id}`) : [];
  return applyItems([item], variations);
}

async function applyItems(
  items: StoreItem[],
  variations: StoreItem[],
): Promise<SyncResult> {
  const products = [...items].sort((a, b) => a.id - b.id);

  // `linked` says the row already had its WooCommerce id saved.
  const existing = (
    await db.query<ExistingProduct>(
      "SELECT id, wc_id, wc_id IS NOT NULL AS linked, sku, name, price, image_url FROM products",
    )
  ).rows;
  const existingVariants = (
    await db.query<ExistingVariant>(
      `SELECT id, product_id, wc_id, wc_id IS NOT NULL AS linked, sku, name, price, position
       FROM product_variants`,
    )
  ).rows;
  // Before ids were saved, items were stored under their SKU, or WC-<id>
  // when they had none or it was already taken.
  const skuMatches = (row: { sku: string }, item: StoreItem) =>
    row.sku === item.sku.trim() || row.sku === `WC-${item.id}`;

  // SKUs must be unique across products and options. New items without one,
  // or whose SKU is already taken, use their WooCommerce id instead.
  const used = new Set([...existing, ...existingVariants].map((r) => r.sku));
  const newSku = (item: StoreItem) => {
    const sku = item.sku.trim();
    const chosen = sku && !used.has(sku) ? sku : `WC-${item.id}`;
    used.add(chosen);
    return chosen;
  };

  const result: SyncResult = { added: 0, updated: 0, unchanged: 0, skipped: [] };

  await transaction(async (client) => {
    for (const item of products) {
      const name = productName(item);
      const opts =
        item.type === "variable"
          ? variations
              .filter((v) => v.parent === item.id)
              .flatMap((v) => {
                const optName = optionName(v.variation) || `Option ${v.id}`;
                if (!(priceOf(v) > 0)) {
                  result.skipped.push(`${name} — ${optName} (no price)`);
                  return [];
                }
                return [{ item: v, name: optName, price: priceOf(v) }];
              })
              .sort((a, b) => byNumber.compare(a.name, b.name))
          : [];
      // Option names must differ within a product.
      for (const opt of opts)
        if (opts.filter((o) => o.name === opt.name).length > 1)
          opt.name = `${opt.name} (${opt.item.sku || opt.item.id})`;

      if (item.type === "variable" && opts.length === 0) {
        result.skipped.push(`${name} (no options with a price)`);
        continue;
      }
      const price = opts.length
        ? Math.min(...opts.map((o) => o.price))
        : priceOf(item);
      if (!(price > 0)) {
        result.skipped.push(`${name} (no price)`);
        continue;
      }
      const image = imageOf(item);

      const match =
        existing.find((p) => p.wc_id === item.id) ??
        existing.find((p) => p.wc_id === null && skuMatches(p, item));
      // Claim it, so a later website item with the same SKU can't.
      if (match) match.wc_id = item.id;
      let productId: string;
      let changed = false;
      if (match) {
        productId = match.id;
        if (
          !match.linked ||
          match.name !== name ||
          match.price !== price ||
          (image !== null && match.image_url !== image)
        ) {
          await client.query(
            `UPDATE products SET wc_id = $2, name = $3, price = $4,
               image_url = COALESCE($5, image_url), updated_at = now()
             WHERE id = $1`,
            [productId, item.id, name, price, image],
          );
          changed = true;
        }
      } else {
        productId = randomUUID();
        await client.query(
          `INSERT INTO products (id, wc_id, sku, name, price, image_url, quantity)
           VALUES ($1, $2, $3, $4, $5, $6, 0)`,
          [productId, item.id, newSku(item), name, price, image],
        );
        result.added++;
      }

      for (const [position, opt] of opts.entries()) {
        const own = existingVariants.filter((v) => v.product_id === productId);
        const variant =
          own.find((v) => v.wc_id === opt.item.id) ??
          own.find((v) => v.wc_id === null && skuMatches(v, opt.item));
        if (variant) variant.wc_id = opt.item.id;
        if (!variant) {
          await client.query(
            `INSERT INTO product_variants (id, product_id, wc_id, name, sku, price, quantity, position)
             VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
            [randomUUID(), productId, opt.item.id, opt.name, newSku(opt.item), opt.price, position],
          );
          changed = true;
        } else if (
          !variant.linked ||
          variant.name !== opt.name ||
          variant.price !== opt.price ||
          variant.position !== position
        ) {
          await client.query(
            `UPDATE product_variants SET wc_id = $2, name = $3, price = $4,
               position = $5, updated_at = now()
             WHERE id = $1`,
            [variant.id, opt.item.id, opt.name, opt.price, position],
          );
          changed = true;
        }
      }

      if (match) {
        if (changed) result.updated++;
        else result.unchanged++;
      }
    }
  });
  return result;
}
