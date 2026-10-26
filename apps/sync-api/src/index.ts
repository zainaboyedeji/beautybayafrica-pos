import { db, transaction } from "./db";
import { syncFromWooCommerce, syncOneProduct } from "./woocommerce";
import express from "express";
import type { PoolClient } from "pg";
import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type {
  ActivityAction,
  ActivityEntry,
  CloudinaryUrl,
  Customer,
  Expense,
  ExpensePaymentMethod,
  Inventory,
  Order,
  OrderItem,
  PaymentMethod,
  Product,
  ProductVariant,
  RequestKind,
  RequestStatus,
  Seller,
  StoreItem,
  StoreItemAssignment,
  StoreItemStatus,
  StoreRequest,
  Supplier,
  UserSummary,
} from "@pos/types";

const app = express();
const port = Number(process.env.PORT ?? 4000);

// Behind a hosting proxy (e.g. Render), set TRUST_PROXY=1 so login attempts
// are counted per visitor rather than for the proxy as a whole.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));

// An error with the HTTP status to answer with, for use inside transactions.
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- Database rows ---------------------------------------------------------

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  price: number;
  cost_price: number | null;
  barcode: string | null;
  image_url: string | null;
  category: string | null;
  quantity: number;
  wc_id: number | null;
  updated_at: Date;
};

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  price: row.price,
  ...(row.cost_price !== null ? { costPrice: row.cost_price } : {}),
  ...(row.barcode !== null ? { barcode: row.barcode } : {}),
  ...(row.image_url !== null
    ? { imageUrl: row.image_url as CloudinaryUrl }
    : {}),
  ...(row.category !== null ? { category: row.category } : {}),
  ...(row.wc_id !== null ? { fromWebsite: true } : {}),
});

type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  price: number;
  cost_price: number | null;
  barcode: string | null;
  quantity: number;
  wc_id: number | null;
  updated_at: Date;
};

const toVariant = (row: VariantRow): ProductVariant => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  price: row.price,
  ...(row.cost_price !== null ? { costPrice: row.cost_price } : {}),
  ...(row.barcode !== null ? { barcode: row.barcode } : {}),
  ...(row.wc_id !== null ? { fromWebsite: true } : {}),
});

const fetchVariants = async (productIds?: string[]) =>
  (
    await db.query<VariantRow>(
      `SELECT * FROM product_variants
       WHERE $1::text[] IS NULL OR product_id = ANY($1)
       ORDER BY position`,
      [productIds ?? null],
    )
  ).rows;

/** Products in the order they were added, each with its options (if any). */
const withVariants = (rows: ProductRow[], variants: VariantRow[]): Product[] =>
  rows.map((row) => {
    const own = variants.filter((v) => v.product_id === row.id);
    const product = toProduct(row);
    return own.length > 0 ? { ...product, variants: own.map(toVariant) } : product;
  });

type CustomerRow = { name: string; phone: string; email: string | null };

const toCustomer = (row: CustomerRow): Customer => ({
  name: row.name,
  phone: row.phone,
  ...(row.email !== null ? { email: row.email } : {}),
});

// Customers are matched by phone number (ignoring spaces).
const phoneKey = (phone: string) => phone.replace(/\s+/g, "");

// --- CSV inventory import -------------------------------------------------

// Accepted column headers (case-insensitive). The second names in each list
// match a WooCommerce product export, so that file can be uploaded as-is.
const COLUMN_ALIASES = {
  sku: ["sku"],
  name: ["name", "product", "product name", "item"],
  price: ["price", "regular price", "unit price", "selling price"],
  costPrice: ["cost_price", "cost price", "cost", "purchase price", "buying price"],
  quantity: ["quantity", "qty", "stock", "stock quantity", "in stock"],
  imageUrl: ["image_url", "image url", "image", "images"],
  category: ["category", "categories"],
  barcode: ["barcode", "gtin, upc, ean, or isbn", "gtin", "upc", "ean"],
} as const;

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
};

const parseNumber = (value: string) => {
  const digits = value.replace(/[^0-9.\-]/g, "");
  return digits === "" ? NaN : Number(digits);
};

// --- Login -----------------------------------------------------------------

// The admin logs in with ADMIN_PASSWORD; staff log in with a PIN the admin
// gives them. Staff can only use the till and make requests.
type Role = "admin" | "staff";
type Session = { role: Role; name: string; staffId?: string; exp: number };
// `job_role` is a job title (Sales attendant, Store manager…) for the record only.
type StaffRow = {
  id: string;
  name: string;
  job_role: string | null;
  salt: string;
  pin_hash: string;
  created_at: Date;
};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
if (!ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD is not set, so the admin cannot log in.");
}
// Without a fixed SESSION_SECRET everyone is logged out when the server restarts.
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");
const SESSION_HOURS = 12;

const fetchStaff = async () =>
  (await db.query<StaffRow>("SELECT * FROM staff ORDER BY created_at")).rows;

const hashPin = (pin: string, salt: string) =>
  scryptSync(pin, salt, 32).toString("hex");

const pinMatches = (member: StaffRow, pin: string) =>
  timingSafeEqual(
    Buffer.from(hashPin(pin, member.salt), "hex"),
    Buffer.from(member.pin_hash, "hex"),
  );

// Compares hashes so the check takes the same time whatever was typed.
const passwordMatches = (password: string) =>
  ADMIN_PASSWORD !== "" &&
  timingSafeEqual(
    createHmac("sha256", SESSION_SECRET).update(password).digest(),
    createHmac("sha256", SESSION_SECRET).update(ADMIN_PASSWORD).digest(),
  );

const sign = (payload: string) =>
  createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");

const createToken = (session: Omit<Session, "exp">) => {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + SESSION_HOURS * 3600_000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

const readToken = async (header: string | undefined): Promise<Session | null> => {
  const [payload, signature] = (header ?? "").replace(/^Bearer /, "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  const session: Session = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  );
  if (session.exp < Date.now()) return null;
  // A removed staff member is logged out straight away.
  if (session.role === "staff") {
    const { rowCount } = await db.query("SELECT 1 FROM staff WHERE id = $1", [
      session.staffId,
    ]);
    if (!rowCount) return null;
  }
  return session;
};

const requireRole =
  (...roles: Role[]): express.RequestHandler =>
  async (req, res, next) => {
    const session = await readToken(req.header("authorization"));
    if (!session) {
      res.status(401).json({ error: "Please log in" });
      return;
    }
    if (!roles.includes(session.role)) {
      res.status(403).json({ error: "Only the admin can do this" });
      return;
    }
    res.locals.session = session;
    next();
  };

/** The logged-in user, for handlers behind requireRole. */
const sessionOf = (res: express.Response) => res.locals.session as Session;

// --- Activity log ------------------------------------------------------------

type Actor = { role: Role | "visitor"; name: string; staffId?: string };

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

/** Adds a line to the admin's activity log. A failure here never undoes the action. */
const logActivity = async (actor: Actor, action: ActivityAction, summary: string) => {
  try {
    await db.query(
      `INSERT INTO activity_log (actor_role, actor_name, staff_id, action, summary)
       VALUES ($1, $2, $3, $4, $5)`,
      [actor.role, actor.name, actor.staffId ?? null, action, summary],
    );
  } catch (err) {
    console.error("Could not save activity:", err);
  }
};

/**
 * SQL that limits a query to one user's rows: "admin", or a staff id.
 * `role` and `staffId` are the table's column names.
 */
const userFilter = (user: string, role: string, staffId: string, param: number) =>
  user === "admin" ? `${role} = 'admin'` : `${staffId} = $${param}`;

/** Logs an action by the logged-in user. */
const logBy = (res: express.Response, action: ActivityAction, summary: string) =>
  logActivity(sessionOf(res), action, summary);

const anyone = requireRole("admin", "staff");
const adminOnly = requireRole("admin");

// PINs are short, so lock a device out after too many wrong attempts.
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const failedLogins = new Map<string, { count: number; until: number }>();

// The till app runs on another origin (localhost:3000 / tauri://localhost).
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
// --- Website webhook -------------------------------------------------------

// WooCommerce calls this when a product is created or updated, so website
// price changes reach the till within seconds. WOOCOMMERCE_WEBHOOK_SECRET is
// the secret entered for the webhook in WooCommerce → Settings → Advanced →
// Webhooks. (Registered before express.json: the signature covers the raw body.)
const WEBHOOK_SECRET = process.env.WOOCOMMERCE_WEBHOOK_SECRET ?? "";

// Saving a product with many options sends one call per option; wait a
// moment and refresh each product once.
const pendingProducts = new Set<number>();
let webhookTimer: NodeJS.Timeout | undefined;
const refreshPending = async () => {
  for (const wcId of [...pendingProducts]) {
    pendingProducts.delete(wcId);
    try {
      const result = await syncOneProduct(wcId);
      if (result?.added || result?.updated)
        console.log(`Website change: product ${wcId} refreshed.`);
    } catch (err) {
      // The nightly sync will pick it up instead.
      console.error(`Website change for product ${wcId} failed:`, err);
    }
  }
};

app.post(
  "/webhooks/woocommerce",
  express.raw({ type: "*/*", limit: "5mb" }),
  (req, res) => {
    const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    // WooCommerce sends an unsigned "webhook_id=…" ping when a webhook is saved.
    if (body.toString("utf8", 0, 11) === "webhook_id=") {
      res.sendStatus(200);
      return;
    }
    const given = Buffer.from(req.header("x-wc-webhook-signature") ?? "");
    const expected = Buffer.from(
      createHmac("sha256", WEBHOOK_SECRET).update(body).digest("base64"),
    );
    if (
      !WEBHOOK_SECRET ||
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    ) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    let payload: { id?: number; parent_id?: number };
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }
    const wcId = Number(payload.parent_id || payload.id);
    if (Number.isInteger(wcId) && wcId > 0) {
      pendingProducts.add(wcId);
      clearTimeout(webhookTimer);
      webhookTimer = setTimeout(refreshPending, 3_000);
    }
    // Answer straight away; WooCommerce gives up on slow replies.
    res.sendStatus(202);
  },
);

app.use(express.json());
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }));

// Opening the server's address in a browser shows this instead of an error.
app.get("/", (_req, res) => {
  res.json({ service: "POS sync API", status: "ok" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/auth/login", async (req, res) => {
  const key = req.ip ?? "unknown";
  const failed = failedLogins.get(key);
  if (failed && failed.count >= MAX_FAILED_LOGINS && failed.until > Date.now()) {
    res.status(429).json({
      error: `Too many wrong attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
    });
    return;
  }

  const password = String(req.body?.password ?? "");
  const pin = String(req.body?.pin ?? "").trim();
  let session: Omit<Session, "exp"> | null = null;
  if (password && passwordMatches(password)) {
    session = { role: "admin", name: "Admin" };
  } else if (pin) {
    const member = (await fetchStaff()).find((m) => pinMatches(m, pin));
    if (member)
      session = { role: "staff", name: member.name, staffId: member.id };
  }

  if (!session) {
    const count = failed && failed.until > Date.now() ? failed.count + 1 : 1;
    failedLogins.set(key, {
      count,
      until: Date.now() + LOCKOUT_MINUTES * 60_000,
    });
    await logActivity(
      { role: "visitor", name: "Unknown" },
      "login_failed",
      password ? "Wrong admin password" : "Wrong staff PIN",
    );
    res
      .status(401)
      .json({ error: password ? "Wrong password" : "Wrong PIN" });
    return;
  }
  failedLogins.delete(key);
  await logActivity(session, "login", session.role === "admin" ? "Logged in to the back office" : "Logged in to the till");
  res.json({ token: createToken(session), role: session.role, name: session.name });
});

app.get("/staff", adminOnly, async (_req, res) => {
  res.json(
    (await fetchStaff()).map(({ id, name, job_role }) => ({
      id,
      name,
      ...(job_role !== null ? { role: job_role } : {}),
    })),
  );
});

app.post("/staff", adminOnly, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const role = String(req.body?.role ?? "").trim();
  const pin = String(req.body?.pin ?? "").trim();
  if (!name || !role) {
    res.status(400).json({ error: "Name and role are required" });
    return;
  }
  if (!/^\d{4,8}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be 4 to 8 digits" });
    return;
  }
  // Staff log in with the PIN alone, so each one must be different.
  if ((await fetchStaff()).some((m) => pinMatches(m, pin))) {
    res.status(409).json({ error: "Another staff member already uses that PIN" });
    return;
  }
  const salt = randomBytes(16).toString("hex");
  const id = randomUUID();
  await db.query(
    `INSERT INTO staff (id, name, job_role, salt, pin_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, name, role, salt, hashPin(pin, salt)],
  );
  await logBy(res, "staff_added", `Added ${name} (${role})`);
  res.status(201).json({ id, name, role });
});

// Change a staff member's name or role. Their PIN stays the same; a new name
// shows from their next login.
app.put("/staff/:id", adminOnly, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const role = String(req.body?.role ?? "").trim();
  if (!name || !role) {
    res.status(400).json({ error: "Name and role are required" });
    return;
  }
  const { rowCount } = await db.query(
    "UPDATE staff SET name = $2, job_role = $3 WHERE id = $1",
    [req.params.id, name, role],
  );
  if (!rowCount) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  await logBy(res, "staff_updated", `Updated ${name} (${role})`);
  res.json({ id: req.params.id, name, role });
});

// Give a staff member a new PIN, e.g. when they have forgotten theirs.
app.put("/staff/:id/pin", adminOnly, async (req, res) => {
  const pin = String(req.body?.pin ?? "").trim();
  if (!/^\d{4,8}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be 4 to 8 digits" });
    return;
  }
  const staff = await fetchStaff();
  const member = staff.find((m) => m.id === req.params.id);
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  if (staff.some((m) => m.id !== member.id && pinMatches(m, pin))) {
    res.status(409).json({ error: "Another staff member already uses that PIN" });
    return;
  }
  const salt = randomBytes(16).toString("hex");
  await transaction(async (client) => {
    await client.query(
      "UPDATE staff SET salt = $2, pin_hash = $3 WHERE id = $1",
      [member.id, salt, hashPin(pin, salt)],
    );
    // Their open PIN requests are answered now, including one picked from the
    // Requests page whose name didn't match a staff member.
    await client.query(
      `UPDATE store_requests SET status = 'done', decided_at = now(),
         requested_by_staff_id = $1,
         decision_note = 'New PIN set for ' || $2 || '. Tell them in person.'
       WHERE kind = 'pin_reset' AND status = 'pending'
         AND (requested_by_staff_id = $1 OR id = $3)`,
      [member.id, member.name, optionalText(req.body?.requestId)],
    );
  });
  await logBy(res, "pin_reset", `Set a new PIN for ${member.name}`);
  res.json({ id: member.id, name: member.name });
});

app.delete("/staff/:id", adminOnly, async (req, res) => {
  const { rows } = await db.query<{ name: string }>(
    "DELETE FROM staff WHERE id = $1 RETURNING name",
    [req.params.id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  await logBy(res, "staff_removed", `Removed ${rows[0].name}`);
  res.sendStatus(204);
});

app.get("/products", anyone, async (_req, res) => {
  const { rows } = await db.query<ProductRow>(
    "SELECT * FROM products ORDER BY created_at",
  );
  res.json(withVariants(rows, await fetchVariants()));
});

type VariantInput = Omit<ProductVariant, "id"> & {
  /** Set when editing an option that already exists. */
  id?: string;
  quantity: number;
};

type ProductInput = Omit<Product, "id" | "variants"> & {
  quantity: number;
  variants: VariantInput[];
};

// Validates the options sent with a product. Returns an error message when
// one is invalid.
const readVariants = (raw: unknown, productSku: string): VariantInput[] | string => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "Options must be a list";
  const variants: VariantInput[] = [];
  for (const [index, body] of raw.entries()) {
    const label = `Option ${index + 1}`;
    const name = String(body?.name ?? "").trim();
    const sku = String(body?.sku ?? "").trim();
    const price = Number(body?.price);
    const quantity = Number(body?.quantity);
    const rawCost = body?.costPrice;
    const hasCost = rawCost !== undefined && rawCost !== null && rawCost !== "";
    const costPrice = Number(rawCost);
    const barcode = String(body?.barcode ?? "").trim();
    const id = String(body?.id ?? "").trim();

    if (!name || !sku) return `${label}: name and SKU are required`;
    if (!(price >= 0) || !Number.isInteger(quantity) || quantity < 0)
      return `${label}: price and quantity must be valid, non-negative numbers`;
    if (hasCost && !(costPrice >= 0)) return `${label}: cost price must be a valid number`;
    if (variants.some((v) => v.name.toLowerCase() === name.toLowerCase()))
      return `Two options are called ${name}`;
    if (sku === productSku || variants.some((v) => v.sku === sku))
      return `SKU ${sku} is used more than once in this product`;
    if (barcode && variants.some((v) => v.barcode === barcode))
      return `Barcode ${barcode} is used more than once in this product`;

    variants.push({
      ...(id ? { id } : {}),
      name,
      sku,
      price,
      quantity,
      ...(hasCost ? { costPrice } : {}),
      ...(barcode ? { barcode } : {}),
    });
  }
  return variants;
};

// Validates a product sent by the add / edit forms. Returns an error message
// when the input is invalid.
const readProductInput = (body: any): ProductInput | string => {
  const sku = String(body?.sku ?? "").trim();
  const variants = readVariants(body?.variants, sku);
  if (typeof variants === "string") return variants;
  // With options, the product's own price, stock, cost and barcode come from
  // (or belong to) its options instead.
  if (variants.length > 0) {
    const name = String(body?.name ?? "").trim();
    if (!sku || !name) return "SKU and name are required";
    const imageUrl = String(body?.imageUrl ?? "").trim();
    if (imageUrl && !imageUrl.startsWith("https://res.cloudinary.com/"))
      return "Image link must start with https://res.cloudinary.com/";
    const category = String(body?.category ?? "").trim();
    return {
      sku,
      name,
      price: Math.min(...variants.map((v) => v.price)),
      quantity: 0,
      variants,
      ...(imageUrl ? { imageUrl: imageUrl as CloudinaryUrl } : {}),
      ...(category ? { category } : {}),
    };
  }
  const product = readSimpleProduct(body);
  return typeof product === "string" ? product : { ...product, variants: [] };
};

const readSimpleProduct = (
  body: any,
): Omit<ProductInput, "variants"> | string => {
  const sku = String(body?.sku ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const price = Number(body?.price);
  const quantity = Number(body?.quantity);
  const rawCost = body?.costPrice;
  const hasCost = rawCost !== undefined && rawCost !== null && rawCost !== "";
  const costPrice = Number(rawCost);

  if (!sku || !name) return "SKU and name are required";
  if (!(price >= 0) || !Number.isInteger(quantity) || quantity < 0)
    return "Price and quantity must be valid, non-negative numbers";
  if (hasCost && !(costPrice >= 0)) return "Cost price must be a valid number";
  const barcode = String(body?.barcode ?? "").trim();
  const imageUrl = String(body?.imageUrl ?? "").trim();
  if (imageUrl && !imageUrl.startsWith("https://res.cloudinary.com/"))
    return "Image link must start with https://res.cloudinary.com/";
  const category = String(body?.category ?? "").trim();

  return {
    sku,
    name,
    price,
    quantity,
    ...(hasCost ? { costPrice } : {}),
    ...(barcode ? { barcode } : {}),
    ...(imageUrl ? { imageUrl: imageUrl as CloudinaryUrl } : {}),
    ...(category ? { category } : {}),
  };
};

// SKUs and barcodes must be unique across products and their options, so a
// scan finds one thing. `exceptId` is the product being edited.
const findConflict = async (input: ProductInput, exceptId = "") => {
  const skus = [input.sku, ...input.variants.map((v) => v.sku)];
  const barcodes = [input.barcode, ...input.variants.map((v) => v.barcode)].filter(
    (b): b is string => b !== undefined,
  );
  const { rows } = await db.query<{ sku: string; barcode: string | null }>(
    `SELECT sku, barcode FROM products
       WHERE id <> $1 AND (sku = ANY($2) OR barcode = ANY($3))
     UNION ALL
     SELECT sku, barcode FROM product_variants
       WHERE product_id <> $1 AND (sku = ANY($2) OR barcode = ANY($3))`,
    [exceptId, skus, barcodes],
  );
  const sku = skus.find((s) => rows.some((r) => r.sku === s));
  if (sku) return `A product with SKU ${sku} already exists`;
  const barcode = barcodes.find((b) => rows.some((r) => r.barcode === b));
  if (barcode) return `A product with barcode ${barcode} already exists`;
  return null;
};

/**
 * Makes the product's options match `variants`: missing ones are removed,
 * known ones updated and the rest added. Ids that aren't this product's
 * options are treated as new.
 */
const saveVariants = async (
  client: PoolClient,
  productId: string,
  variants: VariantInput[],
) => {
  const existing = new Set(
    (
      await client.query<{ id: string }>(
        "SELECT id FROM product_variants WHERE product_id = $1",
        [productId],
      )
    ).rows.map((r) => r.id),
  );
  const ids = variants.map((v) =>
    v.id && existing.has(v.id) ? v.id : randomUUID(),
  );
  await client.query(
    "DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2))",
    [productId, ids],
  );
  for (const [position, variant] of variants.entries()) {
    await client.query(
      `INSERT INTO product_variants
         (id, product_id, name, sku, price, cost_price, barcode, quantity, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sku = EXCLUDED.sku,
         price = EXCLUDED.price, cost_price = EXCLUDED.cost_price,
         barcode = EXCLUDED.barcode, quantity = EXCLUDED.quantity,
         position = EXCLUDED.position, updated_at = now()`,
      [
        ids[position],
        productId,
        variant.name,
        variant.sku,
        variant.price,
        variant.costPrice ?? null,
        variant.barcode ?? null,
        variant.quantity,
        position,
      ],
    );
  }
};

/**
 * Products and options from the online shop keep the selling price the
 * website sync gave them; it is changed on the website instead.
 */
const keepWebsitePrices = async (productId: string, input: ProductInput) => {
  const product = (
    await db.query<{ wc_id: number | null; price: number }>(
      "SELECT wc_id, price FROM products WHERE id = $1",
      [productId],
    )
  ).rows[0];
  const locked = new Map(
    (
      await db.query<{ id: string; price: number }>(
        "SELECT id, price FROM product_variants WHERE product_id = $1 AND wc_id IS NOT NULL",
        [productId],
      )
    ).rows.map((v) => [v.id, v.price]),
  );
  for (const variant of input.variants)
    if (variant.id && locked.has(variant.id)) variant.price = locked.get(variant.id)!;
  if (input.variants.length > 0)
    input.price = Math.min(...input.variants.map((v) => v.price));
  else if (product?.wc_id != null) input.price = product.price;
};

const productValues = (input: Omit<ProductInput, "variants">) => [
  input.sku,
  input.name,
  input.price,
  input.costPrice ?? null,
  input.barcode ?? null,
  input.imageUrl ?? null,
  input.quantity,
  input.category ?? null,
];

app.post("/products", adminOnly, async (req, res) => {
  const input = readProductInput(req.body);
  if (typeof input === "string") {
    res.status(400).json({ error: input });
    return;
  }
  const conflict = await findConflict(input);
  if (conflict) {
    res.status(409).json({ error: conflict });
    return;
  }

  const product = await transaction(async (client) => {
    const { rows } = await client.query<ProductRow>(
      `INSERT INTO products (sku, name, price, cost_price, barcode, image_url, quantity, category, id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [...productValues(input), randomUUID()],
    );
    await saveVariants(client, rows[0].id, input.variants);
    return rows[0];
  });
  await logBy(res, "product_added", `Added ${product.name} (${product.sku})`);
  res
    .status(201)
    .json(withVariants([product], await fetchVariants([product.id]))[0]);
});

app.put("/products/:id", adminOnly, async (req, res) => {
  const id = String(req.params.id);
  const input = readProductInput(req.body);
  if (typeof input === "string") {
    res.status(400).json({ error: input });
    return;
  }
  const conflict = await findConflict(input, id);
  if (conflict) {
    res.status(409).json({ error: conflict });
    return;
  }
  await keepWebsitePrices(id, input);

  // Past orders keep their own copy of the name and prices, so they are
  // unaffected. Optional fields left empty are removed.
  const product = await transaction(async (client) => {
    const { rows } = await client.query<ProductRow>(
      `UPDATE products SET sku = $1, name = $2, price = $3, cost_price = $4,
         barcode = $5, image_url = $6, quantity = $7, category = $8,
         updated_at = now()
       WHERE id = $9 RETURNING *`,
      [...productValues(input), id],
    );
    if (rows.length === 0) throw new HttpError(404, "Product not found");
    await saveVariants(client, id, input.variants);
    return rows[0];
  });
  await logBy(res, "product_updated", `Updated ${product.name} (${product.sku})`);
  res.json(withVariants([product], await fetchVariants([id]))[0]);
});

app.get("/inventory", anyone, async (_req, res) => {
  // A product with options reports their total, followed by one row each.
  const { rows } = await db.query<{
    product_id: string;
    variant_id: string | null;
    quantity: number;
    updated_at: Date;
  }>(
    `SELECT p.id AS product_id, NULL AS variant_id,
            COALESCE(v.quantity, p.quantity) AS quantity,
            GREATEST(p.updated_at, v.updated_at) AS updated_at
     FROM products p
     LEFT JOIN (
       SELECT product_id, sum(quantity)::int AS quantity, max(updated_at) AS updated_at
       FROM product_variants GROUP BY product_id
     ) v ON v.product_id = p.id
     UNION ALL
     SELECT product_id, id, quantity, updated_at FROM product_variants`,
  );
  res.json(
    rows.map(
      (row): Inventory => ({
        productId: row.product_id,
        ...(row.variant_id !== null ? { variantId: row.variant_id } : {}),
        quantity: row.quantity,
        updatedAt: row.updated_at.toISOString(),
      }),
    ),
  );
});

app.post("/inventory/import", adminOnly, async (req, res) => {
  const rows = typeof req.body === "string" ? parseCsv(req.body) : [];
  if (rows.length < 2) {
    res.status(400).json({ error: "The file has no product rows" });
    return;
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const column = (key: keyof typeof COLUMN_ALIASES) =>
    headers.findIndex((h) =>
      (COLUMN_ALIASES[key] as readonly string[]).includes(h),
    );
  const cols = {
    sku: column("sku"),
    name: column("name"),
    price: column("price"),
    quantity: column("quantity"),
    costPrice: column("costPrice"),
    imageUrl: column("imageUrl"),
    barcode: column("barcode"),
    category: column("category"),
  };
  const missing = (["sku", "name", "price", "quantity"] as const).filter(
    (key) => cols[key] === -1,
  );
  if (missing.length > 0) {
    res
      .status(400)
      .json({ error: `Missing required column(s): ${missing.join(", ")}` });
    return;
  }

  // Which product each barcode already belongs to.
  const barcodeOwners = new Map(
    (
      await db.query<{ sku: string; barcode: string }>(
        "SELECT sku, barcode FROM products WHERE barcode IS NOT NULL",
      )
    ).rows.map((p) => [p.barcode, p.sku]),
  );
  // Options are edited in the app, not by CSV, so their SKUs and barcodes
  // and the products that have them are left alone.
  const variants = await fetchVariants();
  const variantSkus = new Set(variants.map((v) => v.sku));
  const variantBarcodes = new Set(variants.flatMap((v) => v.barcode ?? []));
  const skusWithOptions = new Set(
    (
      await db.query<{ sku: string }>(
        `SELECT sku FROM products p
         WHERE EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)`,
      )
    ).rows.map((p) => p.sku),
  );

  const errors: { row: number; message: string }[] = [];
  const valid: Omit<ProductInput, "variants">[] = [];
  const seen = new Set<string>();
  const seenBarcodes = new Set<string>();
  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const sku = (cells[cols.sku] ?? "").trim();
    const name = (cells[cols.name] ?? "").trim();
    const price = parseNumber(cells[cols.price] ?? "");
    const quantity = parseNumber(cells[cols.quantity] ?? "");
    const costCell =
      cols.costPrice === -1 ? "" : (cells[cols.costPrice] ?? "").trim();
    const costPrice = parseNumber(costCell);
    const image = cols.imageUrl === -1 ? "" : (cells[cols.imageUrl] ?? "").trim();
    const barcode =
      cols.barcode === -1 ? "" : (cells[cols.barcode] ?? "").trim();
    // A WooCommerce export lists "Skincare > Serums, Sale": keep the first
    // category's top level.
    const category =
      cols.category === -1
        ? ""
        : (cells[cols.category] ?? "").split(",")[0].split(">")[0].trim();
    const fail = (message: string) => errors.push({ row: rowNumber, message });

    if (!sku) return fail("SKU is empty");
    if (seen.has(sku)) return fail(`SKU ${sku} appears more than once`);
    if (variantSkus.has(sku))
      return fail(`SKU ${sku} belongs to a product option; edit it in the app`);
    if (skusWithOptions.has(sku))
      return fail(`Product ${sku} has options; edit it in the app`);
    if (barcode && variantBarcodes.has(barcode))
      return fail(`Barcode ${barcode} belongs to a product option`);
    if (!name) return fail("Name is empty");
    if (barcode && seenBarcodes.has(barcode))
      return fail(`Barcode ${barcode} appears more than once`);
    const owner = barcodeOwners.get(barcode);
    if (barcode && owner !== undefined && owner !== sku)
      return fail(`Barcode ${barcode} already belongs to another product`);
    if ((cells[cols.price] ?? "").trim() === "" || !(price >= 0))
      return fail("Price is not a valid number");
    if (costCell !== "" && !(costPrice >= 0))
      return fail("Cost price is not a valid number");
    if (
      (cells[cols.quantity] ?? "").trim() === "" ||
      !Number.isInteger(quantity) ||
      quantity < 0
    )
      return fail("Quantity is not a whole number");

    seen.add(sku);
    if (barcode) seenBarcodes.add(barcode);
    valid.push({
      sku,
      name,
      price,
      quantity,
      ...(costCell !== "" ? { costPrice } : {}),
      ...(barcode ? { barcode } : {}),
      ...(image.startsWith("https://res.cloudinary.com/")
        ? { imageUrl: image as CloudinaryUrl }
        : {}),
      ...(category ? { category } : {}),
    });
  });

  if (valid.length === 0) {
    res.status(400).json({ error: "No valid product rows found", errors });
    return;
  }

  // One statement for the whole file. Products are matched by SKU; columns
  // missing from the file keep their current values.
  const result = await db.query<{ inserted: boolean }>(
    `INSERT INTO products (id, sku, name, price, cost_price, barcode, image_url, quantity, category)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[],
                          $5::numeric[], $6::text[], $7::text[], $8::int[], $9::text[])
     ON CONFLICT (sku) DO UPDATE SET
       name = EXCLUDED.name,
       -- The online shop sets the price of products copied from it.
       price = CASE WHEN products.wc_id IS NULL THEN EXCLUDED.price ELSE products.price END,
       cost_price = COALESCE(EXCLUDED.cost_price, products.cost_price),
       barcode = COALESCE(EXCLUDED.barcode, products.barcode),
       image_url = COALESCE(EXCLUDED.image_url, products.image_url),
       category = COALESCE(EXCLUDED.category, products.category),
       quantity = EXCLUDED.quantity,
       updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      valid.map(() => randomUUID()),
      valid.map((p) => p.sku),
      valid.map((p) => p.name),
      valid.map((p) => p.price),
      valid.map((p) => p.costPrice ?? null),
      valid.map((p) => p.barcode ?? null),
      valid.map((p) => p.imageUrl ?? null),
      valid.map((p) => p.quantity),
      valid.map((p) => p.category ?? null),
    ],
  );
  const added = result.rows.filter((r) => r.inserted).length;
  await logBy(
    res,
    "inventory_imported",
    `Uploaded a CSV: ${added} added, ${result.rows.length - added} updated` +
      (errors.length ? `, ${errors.length} skipped` : ""),
  );
  res.json({
    added,
    updated: result.rows.length - added,
    skipped: errors.length,
    errors,
  });
});

app.get("/customers", adminOnly, async (_req, res) => {
  const { rows } = await db.query<CustomerRow>(
    "SELECT name, phone, email FROM customers ORDER BY created_at",
  );
  res.json(rows.map(toCustomer));
});

// Staff can't list customers, but at checkout they may check whether a
// phone number is already saved, so they can confirm it's the same person.
app.get("/customers/lookup", anyone, async (req, res) => {
  const phone = String(req.query.phone ?? "").trim();
  const { rows } = phone
    ? await db.query<CustomerRow>(
        "SELECT name, phone, email FROM customers WHERE phone_key = $1",
        [phoneKey(phone)],
      )
    : { rows: [] };
  if (!rows[0]) {
    res.status(404).json({ error: "No customer with that phone" });
    return;
  }
  res.json(toCustomer(rows[0]));
});

app.post("/customers", adminOnly, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  if (!name || !phone) {
    res.status(400).json({ error: "Customer name and phone are required" });
    return;
  }
  const { rowCount } = await db.query(
    `INSERT INTO customers (phone_key, name, phone, email) VALUES ($1, $2, $3, $4)
     ON CONFLICT (phone_key) DO NOTHING`,
    [phoneKey(phone), name, phone, email || null],
  );
  if (!rowCount) {
    res
      .status(409)
      .json({ error: `A customer with phone ${phone} already exists` });
    return;
  }
  const customer: Customer = { name, phone, ...(email ? { email } : {}) };
  await logBy(res, "customer_added", `Added customer ${name} (${phone})`);
  res.status(201).json(customer);
});

// Every sale, or with ?user= ("admin" or a staff id) only that person's.
app.get("/orders", adminOnly, async (req, res) => {
  const user = String(req.query.user ?? "");
  const { rows } = await db.query<{
    id: string;
    total: number;
    payment_method: PaymentMethod;
    customer_name: string;
    customer_phone: string;
    customer_email: string | null;
    sold_by_role: Seller["role"] | null;
    sold_by_name: string | null;
    sold_by_staff_id: string | null;
    created_at: Date;
    items: OrderItem[];
  }>(
    `SELECT o.*, json_agg(json_strip_nulls(json_build_object(
         'productId', i.product_id, 'variantId', i.variant_id,
         'name', i.name, 'quantity', i.quantity,
         'unitPrice', i.unit_price, 'unitCost', i.unit_cost)) ORDER BY i.line) AS items
     FROM orders o JOIN order_items i ON i.order_id = o.id
     ${user ? `WHERE ${userFilter(user, "o.sold_by_role", "o.sold_by_staff_id", 1)}` : ""}
     GROUP BY o.id ORDER BY o.created_at`,
    user && user !== "admin" ? [user] : [],
  );
  res.json(
    rows.map(
      (row): Order => ({
        id: row.id,
        items: row.items,
        total: row.total,
        paymentMethod: row.payment_method,
        customer: toCustomer({
          name: row.customer_name,
          phone: row.customer_phone,
          email: row.customer_email,
        }),
        ...(row.sold_by_role && row.sold_by_name
          ? {
              soldBy: {
                role: row.sold_by_role,
                name: row.sold_by_name,
                ...(row.sold_by_staff_id ? { staffId: row.sold_by_staff_id } : {}),
              },
            }
          : {}),
        createdAt: row.created_at.toISOString(),
      }),
    ),
  );
});

/** Takes `quantity` of one option out of stock and returns its sale line. */
const takeVariant = async (
  client: PoolClient,
  productId: string,
  variantId: string,
  quantity: number,
): Promise<OrderItem> => {
  const { rows } = await client.query<VariantRow & { product_name: string }>(
    `UPDATE product_variants v SET quantity = v.quantity - $3, updated_at = now()
     FROM products p
     WHERE v.id = $2 AND v.product_id = $1 AND p.id = v.product_id
       AND v.quantity >= $3
     RETURNING v.*, p.name AS product_name`,
    [productId, variantId, quantity],
  );
  if (rows.length === 0) {
    const found = await client.query<{ name: string }>(
      `SELECT p.name || ' — ' || v.name AS name FROM product_variants v
       JOIN products p ON p.id = v.product_id WHERE v.id = $2 AND v.product_id = $1`,
      [productId, variantId],
    );
    throw found.rows.length
      ? new HttpError(409, `Not enough stock for ${found.rows[0].name}`)
      : new HttpError(400, "Invalid order item");
  }
  const variant = rows[0];
  return {
    productId,
    variantId,
    name: `${variant.product_name} — ${variant.name}`,
    quantity,
    unitPrice: variant.price,
    ...(variant.cost_price !== null ? { unitCost: variant.cost_price } : {}),
  };
};

app.post("/orders", anyone, async (req, res) => {
  const requested: unknown = req.body?.items;
  if (!Array.isArray(requested) || requested.length === 0) {
    res.status(400).json({ error: "Order must contain at least one item" });
    return;
  }

  const paymentMethod: unknown = req.body?.paymentMethod;
  if (paymentMethod !== "transfer" && paymentMethod !== "card") {
    res.status(400).json({ error: "Payment method must be transfer or card" });
    return;
  }

  const name = String(req.body?.customer?.name ?? "").trim();
  const phone = String(req.body?.customer?.phone ?? "").trim();
  const email = String(req.body?.customer?.email ?? "").trim();
  if (!name || !phone) {
    res.status(400).json({ error: "Customer name and phone are required" });
    return;
  }

  // Sales recorded in the back office may carry the date they happened.
  let createdAt = new Date();
  if (req.body?.createdAt) {
    createdAt = new Date(String(req.body.createdAt));
    if (Number.isNaN(createdAt.getTime()) || createdAt.getTime() > Date.now()) {
      res.status(400).json({ error: "Sale date must be a valid past date" });
      return;
    }
  }

  const session = sessionOf(res);
  const soldBy: Seller = {
    role: session.role === "admin" ? "admin" : "staff",
    name: session.name,
    ...(session.staffId ? { staffId: session.staffId } : {}),
  };

  // Taking the stock and saving the sale happen together, so two tills
  // selling the last item at once can't both succeed.
  const order = await transaction(async (client) => {
    const items: OrderItem[] = [];
    for (const line of requested) {
      const productId = String(line?.productId ?? "");
      const variantId = String(line?.variantId ?? "");
      const quantity = Number(line?.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0)
        throw new HttpError(400, "Invalid order item");
      if (variantId) {
        items.push(await takeVariant(client, productId, variantId, quantity));
        continue;
      }
      const { rows } = await client.query<ProductRow>(
        `UPDATE products SET quantity = quantity - $2, updated_at = now()
         WHERE id = $1 AND quantity >= $2 RETURNING *`,
        [productId, quantity],
      );
      if (rows.length === 0) {
        const found = await client.query<{ name: string; has_options: boolean }>(
          `SELECT name, EXISTS (SELECT 1 FROM product_variants WHERE product_id = $1)
             AS has_options
           FROM products WHERE id = $1`,
          [productId],
        );
        const product = found.rows[0];
        throw !product
          ? new HttpError(400, "Invalid order item")
          : product.has_options
            ? new HttpError(400, `Choose an option for ${product.name}`)
            : new HttpError(409, `Not enough stock for ${product.name}`);
      }
      const product = rows[0];
      items.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: product.price,
        ...(product.cost_price !== null ? { unitCost: product.cost_price } : {}),
      });
    }

    // Save the customer. A phone number already saved keeps its customer's
    // name, so the sale goes under that name; a new email replaces the old.
    const saved = await client.query<CustomerRow>(
      `INSERT INTO customers (phone_key, name, phone, email) VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone_key) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, customers.email)
       RETURNING name, phone, email`,
      [phoneKey(phone), name, phone, email || null],
    );
    const customer = toCustomer(saved.rows[0]);

    const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const order: Order = {
      id: randomUUID(),
      items,
      total: Math.round(total * 100) / 100,
      paymentMethod: paymentMethod satisfies PaymentMethod,
      customer,
      soldBy,
      createdAt: createdAt.toISOString(),
    };
    await client.query(
      `INSERT INTO orders (id, total, payment_method, customer_name, customer_phone,
         customer_email, created_at, sold_by_role, sold_by_name, sold_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        order.id,
        order.total,
        paymentMethod,
        customer.name,
        customer.phone,
        customer.email ?? null,
        createdAt,
        soldBy.role,
        soldBy.name,
        soldBy.staffId ?? null,
      ],
    );
    for (const [line, item] of items.entries()) {
      await client.query(
        `INSERT INTO order_items (order_id, line, product_id, variant_id, name, quantity, unit_price, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          order.id,
          line,
          item.productId,
          item.variantId ?? null,
          item.name,
          item.quantity,
          item.unitPrice,
          item.unitCost ?? null,
        ],
      );
    }
    return order;
  });
  const count = order.items.reduce((sum, i) => sum + i.quantity, 0);
  await logBy(
    res,
    "sale",
    `Sold ${count} item${count === 1 ? "" : "s"} for ${naira.format(order.total)} ` +
      `(${paymentMethod === "card" ? "card" : "bank transfer"}) to ${order.customer.name}` +
      (req.body?.createdAt ? `, dated ${createdAt.toLocaleDateString("en-NG")}` : ""),
  );
  res.status(201).json(order);
});

// --- Suppliers, expenses and store requests -------------------------------

/** Trimmed text from a request body, or null when left empty. */
const optionalText = (value: unknown) => String(value ?? "").trim() || null;

type SupplierRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: Date;
};

const toSupplier = (row: SupplierRow): Supplier => ({
  id: row.id,
  name: row.name,
  ...(row.contact_person !== null ? { contactPerson: row.contact_person } : {}),
  ...(row.phone !== null ? { phone: row.phone } : {}),
  ...(row.email !== null ? { email: row.email } : {}),
  ...(row.address !== null ? { address: row.address } : {}),
  ...(row.notes !== null ? { notes: row.notes } : {}),
  createdAt: row.created_at.toISOString(),
});

const supplierFields = (body: unknown) => {
  const b = (body ?? {}) as Record<string, unknown>;
  return [
    String(b.name ?? "").trim(),
    optionalText(b.contactPerson),
    optionalText(b.phone),
    optionalText(b.email),
    optionalText(b.address),
    optionalText(b.notes),
  ] as const;
};

app.get("/suppliers", adminOnly, async (_req, res) => {
  const { rows } = await db.query<SupplierRow>(
    "SELECT * FROM suppliers ORDER BY lower(name)",
  );
  res.json(rows.map(toSupplier));
});

app.post("/suppliers", adminOnly, async (req, res) => {
  const fields = supplierFields(req.body);
  if (!fields[0]) {
    res.status(400).json({ error: "Supplier name is required" });
    return;
  }
  const { rows } = await db.query<SupplierRow>(
    `INSERT INTO suppliers (id, name, contact_person, phone, email, address, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [randomUUID(), ...fields],
  );
  await logBy(res, "supplier_added", `Added supplier ${rows[0].name}`);
  res.status(201).json(toSupplier(rows[0]));
});

app.put("/suppliers/:id", adminOnly, async (req, res) => {
  const fields = supplierFields(req.body);
  if (!fields[0]) {
    res.status(400).json({ error: "Supplier name is required" });
    return;
  }
  const { rows } = await db.query<SupplierRow>(
    `UPDATE suppliers SET name = $2, contact_person = $3, phone = $4,
       email = $5, address = $6, notes = $7
     WHERE id = $1 RETURNING *`,
    [req.params.id, ...fields],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  await logBy(res, "supplier_updated", `Updated supplier ${rows[0].name}`);
  res.json(toSupplier(rows[0]));
});

app.delete("/suppliers/:id", adminOnly, async (req, res) => {
  const { rows } = await db.query<{ name: string }>(
    "DELETE FROM suppliers WHERE id = $1 RETURNING name",
    [req.params.id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  await logBy(res, "supplier_removed", `Removed supplier ${rows[0].name}`);
  res.sendStatus(204);
});

type ExpenseRow = {
  id: string;
  spent_on: string;
  description: string;
  category: string;
  amount: number;
  payment_method: ExpensePaymentMethod;
  supplier_id: string | null;
  supplier_name: string | null;
  notes: string | null;
  created_at: Date;
};

const toExpense = (row: ExpenseRow): Expense => ({
  id: row.id,
  spentOn: row.spent_on,
  description: row.description,
  category: row.category,
  amount: row.amount,
  paymentMethod: row.payment_method,
  ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
  ...(row.supplier_name !== null ? { supplierName: row.supplier_name } : {}),
  ...(row.notes !== null ? { notes: row.notes } : {}),
  createdAt: row.created_at.toISOString(),
});

const EXPENSE_PAYMENT_METHODS = ["cash", "transfer", "card"];

app.get("/expenses", adminOnly, async (_req, res) => {
  const { rows } = await db.query<ExpenseRow>(
    "SELECT * FROM expenses ORDER BY spent_on DESC, created_at DESC",
  );
  res.json(rows.map(toExpense));
});

app.post("/expenses", adminOnly, async (req, res) => {
  const spentOn = String(req.body?.spentOn ?? "");
  const description = String(req.body?.description ?? "").trim();
  const category = String(req.body?.category ?? "").trim();
  const amount = Number(req.body?.amount);
  const paymentMethod = String(req.body?.paymentMethod ?? "");
  const supplierId = optionalText(req.body?.supplierId);
  const day = new Date(`${spentOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn) || Number.isNaN(day.getTime())) {
    res.status(400).json({ error: "Choose the date the money was spent" });
    return;
  }
  if (!description || !category) {
    res.status(400).json({ error: "Description and category are required" });
    return;
  }
  if (!(amount > 0)) {
    res.status(400).json({ error: "Amount must be more than 0" });
    return;
  }
  if (!EXPENSE_PAYMENT_METHODS.includes(paymentMethod)) {
    res.status(400).json({ error: "Payment method must be cash, transfer or card" });
    return;
  }
  let supplierName: string | null = null;
  if (supplierId) {
    const found = await db.query<{ name: string }>(
      "SELECT name FROM suppliers WHERE id = $1",
      [supplierId],
    );
    if (!found.rows[0]) {
      res.status(400).json({ error: "Supplier not found" });
      return;
    }
    supplierName = found.rows[0].name;
  }
  const { rows } = await db.query<ExpenseRow>(
    `INSERT INTO expenses (id, spent_on, description, category, amount,
       payment_method, supplier_id, supplier_name, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      randomUUID(),
      spentOn,
      description,
      category,
      Math.round(amount * 100) / 100,
      paymentMethod,
      supplierId,
      supplierName,
      optionalText(req.body?.notes),
    ],
  );
  await logBy(
    res,
    "expense_recorded",
    `Recorded ${naira.format(rows[0].amount)} for ${rows[0].description} (${rows[0].category})`,
  );
  res.status(201).json(toExpense(rows[0]));
});

app.delete("/expenses/:id", adminOnly, async (req, res) => {
  const { rows } = await db.query<{ description: string; amount: number }>(
    "DELETE FROM expenses WHERE id = $1 RETURNING description, amount",
    [req.params.id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  await logBy(
    res,
    "expense_deleted",
    `Deleted ${naira.format(rows[0].amount)} for ${rows[0].description}`,
  );
  res.sendStatus(204);
});

type StoreRequestRow = {
  id: string;
  kind: RequestKind;
  title: string;
  details: string | null;
  requested_by: string;
  requested_by_staff_id: string | null;
  amount: number | null;
  status: RequestStatus;
  decision_note: string | null;
  decided_at: Date | null;
  created_at: Date;
};

const toStoreRequest = (row: StoreRequestRow): StoreRequest => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  ...(row.details !== null ? { details: row.details } : {}),
  requestedBy: row.requested_by,
  ...(row.requested_by_staff_id !== null
    ? { staffId: row.requested_by_staff_id }
    : {}),
  ...(row.amount !== null ? { amount: row.amount } : {}),
  status: row.status,
  ...(row.decision_note !== null ? { decisionNote: row.decision_note } : {}),
  ...(row.decided_at !== null ? { decidedAt: row.decided_at.toISOString() } : {}),
  createdAt: row.created_at.toISOString(),
});

const REQUEST_STATUSES = ["pending", "approved", "rejected", "done"];

// Every request, for the admin to approve or reject.
app.get("/requests", adminOnly, async (_req, res) => {
  const { rows } = await db.query<StoreRequestRow>(
    "SELECT * FROM store_requests ORDER BY created_at DESC",
  );
  res.json(rows.map(toStoreRequest));
});

// The requests the logged-in staff member made (or, for the admin, the admin's).
app.get("/requests/mine", anyone, async (_req, res) => {
  const { staffId } = sessionOf(res);
  const { rows } = await db.query<StoreRequestRow>(
    `SELECT * FROM store_requests
     WHERE requested_by_staff_id IS NOT DISTINCT FROM $1
     ORDER BY created_at DESC`,
    [staffId ?? null],
  );
  res.json(rows.map(toStoreRequest));
});

// Anyone can make a request. A staff member's is saved under their own name; the
// admin may record one on someone else's behalf.
app.post("/requests", anyone, async (req, res) => {
  const session = sessionOf(res);
  // A logged-in staff member can also ask for a new PIN from here.
  const kind: RequestKind =
    session.role === "staff" && req.body?.kind === "pin_reset"
      ? "pin_reset"
      : "general";
  const title =
    kind === "pin_reset"
      ? PIN_REQUEST_TITLE
      : String(req.body?.title ?? "").trim();
  const requestedBy =
    session.role === "staff"
      ? session.name
      : String(req.body?.requestedBy ?? "").trim() || session.name;
  const rawAmount = req.body?.amount;
  const amount =
    rawAmount === undefined || rawAmount === null || rawAmount === ""
      ? null
      : Number(rawAmount);
  if (!title || !requestedBy) {
    res.status(400).json({ error: "Request and who made it are required" });
    return;
  }
  if (amount !== null && !(amount >= 0)) {
    res.status(400).json({ error: "Amount must be a number" });
    return;
  }
  const { rows } = await db.query<StoreRequestRow>(
    `INSERT INTO store_requests (id, kind, title, details, requested_by,
       requested_by_staff_id, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      randomUUID(),
      kind,
      title,
      optionalText(req.body?.details),
      requestedBy,
      session.staffId ?? null,
      amount === null ? null : Math.round(amount * 100) / 100,
    ],
  );
  await logBy(
    res,
    "request_made",
    kind === "pin_reset"
      ? "Asked for a new PIN"
      : `Requested "${title}"` + (requestedBy !== session.name ? ` for ${requestedBy}` : ""),
  );
  res.status(201).json(toStoreRequest(rows[0]));
});

const PIN_REQUEST_TITLE = "New PIN needed";

// Someone who has forgotten their PIN can't log in, so this needs no login.
// It only ever creates a PIN request for the admin, and each device may send
// a few per hour.
const MAX_PIN_REQUESTS = 3;
const pinRequests = new Map<string, { count: number; until: number }>();

app.post("/pin-requests", async (req, res) => {
  const key = req.ip ?? "unknown";
  const recent = pinRequests.get(key);
  const sent = recent && recent.until > Date.now() ? recent.count : 0;
  if (sent >= MAX_PIN_REQUESTS) {
    res
      .status(429)
      .json({ error: "Too many requests from this device. Try again later." });
    return;
  }
  const name = String(req.body?.name ?? "").trim().slice(0, 100);
  if (!name) {
    res.status(400).json({ error: "Enter your name" });
    return;
  }
  pinRequests.set(key, { count: sent + 1, until: Date.now() + 3600_000 });

  // Link it to the staff member when exactly one has that name.
  const { rows: matches } = await db.query<{ id: string }>(
    "SELECT id FROM staff WHERE lower(name) = lower($1)",
    [name],
  );
  const staffId = matches.length === 1 ? matches[0].id : null;
  // One open PIN request per person is enough.
  const { rowCount: open } = await db.query(
    `SELECT 1 FROM store_requests WHERE kind = 'pin_reset' AND status = 'pending'
       AND lower(requested_by) = lower($1)`,
    [name],
  );
  await logActivity(
    { role: "visitor", name },
    "pin_requested",
    "Asked for a new PIN from the login screen",
  );
  if (!open) {
    await db.query(
      `INSERT INTO store_requests (id, kind, title, details, requested_by,
         requested_by_staff_id)
       VALUES ($1, 'pin_reset', $2, $3, $4, $5)`,
      [
        randomUUID(),
        PIN_REQUEST_TITLE,
        optionalText(String(req.body?.note ?? "").slice(0, 500)),
        name,
        staffId,
      ],
    );
  }
  // The same answer either way, so this can't be used to find staff names.
  res.status(201).json({ ok: true });
});

// Approve, reject or mark a request done, with an optional note.
app.put("/requests/:id/status", adminOnly, async (req, res) => {
  const status = String(req.body?.status ?? "");
  if (!REQUEST_STATUSES.includes(status)) {
    res.status(400).json({ error: "Unknown request status" });
    return;
  }
  const { rows } = await db.query<StoreRequestRow>(
    `UPDATE store_requests SET status = $2,
       decision_note = COALESCE($3, decision_note),
       decided_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END
     WHERE id = $1 RETURNING *`,
    [req.params.id, status, optionalText(req.body?.note)],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  await logBy(
    res,
    "request_decided",
    `Marked "${rows[0].title}" from ${rows[0].requested_by} ${status}`,
  );
  res.json(toStoreRequest(rows[0]));
});

// The activity log, newest first. `days` limits it to recent days (0 for
// all) and `user` ("admin" or a staff id) to one person; at most the newest
// 5,000 entries are sent.
app.get("/activity", adminOnly, async (req, res) => {
  const days = Math.max(0, Number(req.query.days ?? 30) || 0);
  const user = String(req.query.user ?? "");
  const { rows } = await db.query<{
    id: string;
    at: Date;
    actor_role: ActivityEntry["actorRole"];
    actor_name: string;
    action: ActivityAction;
    summary: string;
  }>(
    `SELECT id, at, actor_role, actor_name, action, summary FROM activity_log
     WHERE ($1 = 0 OR at > now() - make_interval(days => $1))
       ${user ? `AND ${userFilter(user, "actor_role", "staff_id", 2)}` : ""}
     ORDER BY at DESC LIMIT 5000`,
    user && user !== "admin" ? [days, user] : [days],
  );
  res.json(
    rows.map(
      (row): ActivityEntry => ({
        id: String(row.id),
        at: row.at.toISOString(),
        actorRole: row.actor_role,
        actorName: row.actor_name,
        action: row.action,
        summary: row.summary,
      }),
    ),
  );
});

// Everyone who can log in, plus former staff still in the history, with
// their last login and activity and the sales they made.
app.get("/users", adminOnly, async (_req, res) => {
  type Stats = { uid: string; name: string; last_login: Date | null; last_activity: Date };
  type Sales = { uid: string; name: string; sales: number; total: number };
  const [staff, activity, sales] = await Promise.all([
    fetchStaff(),
    db.query<Stats>(
      `SELECT CASE WHEN actor_role = 'admin' THEN 'admin' ELSE staff_id END AS uid,
         (array_agg(actor_name ORDER BY at DESC))[1] AS name,
         max(at) FILTER (WHERE action = 'login') AS last_login,
         max(at) AS last_activity
       FROM activity_log WHERE actor_role = 'admin' OR staff_id IS NOT NULL
       GROUP BY 1`,
    ),
    db.query<Sales>(
      `SELECT CASE WHEN sold_by_role = 'admin' THEN 'admin' ELSE sold_by_staff_id END AS uid,
         (array_agg(sold_by_name ORDER BY created_at DESC))[1] AS name,
         count(*)::int AS sales, sum(total) AS total
       FROM orders WHERE sold_by_role IS NOT NULL
       GROUP BY 1`,
    ),
  ]);
  const statsOf = new Map(activity.rows.map((r) => [r.uid, r]));
  const salesOf = new Map(sales.rows.map((r) => [r.uid, r]));
  const summary = (
    id: string,
    name: string,
    access: UserSummary["access"],
    extra: Partial<UserSummary> = {},
  ): UserSummary => {
    const stats = statsOf.get(id);
    const sold = salesOf.get(id);
    return {
      id,
      name,
      access,
      ...extra,
      ...(stats?.last_login ? { lastLogin: stats.last_login.toISOString() } : {}),
      ...(stats ? { lastActivity: stats.last_activity.toISOString() } : {}),
      sales: sold?.sales ?? 0,
      salesTotal: sold?.total ?? 0,
    };
  };
  const current = new Set(staff.map((m) => m.id));
  // Former staff are known only by the history they left behind.
  const former = [...new Set([...statsOf.keys(), ...salesOf.keys()])].filter(
    (uid) => uid !== "admin" && !current.has(uid),
  );
  const byName = (a: UserSummary, b: UserSummary) => a.name.localeCompare(b.name);
  res.json([
    summary("admin", "Admin", "admin"),
    ...staff
      .map((m) =>
        summary(m.id, m.name, "staff", {
          ...(m.job_role ? { jobRole: m.job_role } : {}),
          createdAt: m.created_at.toISOString(),
        }),
      )
      .sort(byName),
    ...former
      .map((uid) =>
        summary(uid, statsOf.get(uid)?.name ?? salesOf.get(uid)?.name ?? "Unknown", "former"),
      )
      .sort(byName),
  ]);
});

// --- Store items (things the shop owns) -------------------------------------

type StoreItemRow = {
  id: string;
  tag: string;
  name: string;
  category: string;
  quantity: number;
  unit_cost: number | null;
  bought_on: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  serial_number: string | null;
  status: StoreItemStatus;
  notes: string | null;
  created_at: Date;
  assignments: StoreItemAssignment[];
};

const toStoreItem = (row: StoreItemRow): StoreItem => ({
  id: row.id,
  tag: row.tag,
  name: row.name,
  category: row.category,
  quantity: row.quantity,
  ...(row.unit_cost !== null ? { unitCost: row.unit_cost } : {}),
  ...(row.bought_on !== null ? { boughtOn: row.bought_on } : {}),
  ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
  ...(row.supplier_name !== null ? { supplierName: row.supplier_name } : {}),
  ...(row.serial_number !== null ? { serialNumber: row.serial_number } : {}),
  assignments: row.assignments,
  status: row.status,
  ...(row.notes !== null ? { notes: row.notes } : {}),
  createdAt: row.created_at.toISOString(),
});

const STORE_ITEM_STATUSES = ["in_use", "in_storage", "under_repair", "lost", "disposed"];

type StoreItemInput = {
  name: string;
  category: string;
  quantity: number;
  unitCost: number | null;
  boughtOn: string | null;
  supplierId: string | null;
  supplierName: string | null;
  serialNumber: string | null;
  assignments: StoreItemAssignment[];
  status: StoreItemStatus;
  notes: string | null;
};

/**
 * Reads who has how many. Rows for the same person are added together, and
 * no more can be handed out than the shop has.
 */
const readAssignments = (raw: unknown, quantity: number): StoreItemAssignment[] | string => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "Assignments must be a list";
  const byName = new Map<string, StoreItemAssignment>();
  for (const row of raw) {
    const assignedTo = String(row?.assignedTo ?? "").trim();
    const count = Number(row?.quantity);
    if (!assignedTo) return "Enter who each one is assigned to";
    if (!Number.isInteger(count) || count < 1)
      return `How many ${assignedTo} has must be a whole number of 1 or more`;
    const key = assignedTo.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.quantity += count;
    else byName.set(key, { assignedTo, quantity: count });
  }
  const list = [...byName.values()];
  const handedOut = list.reduce((sum, a) => sum + a.quantity, 0);
  if (handedOut > quantity)
    return `${handedOut} are assigned, but there ${quantity === 1 ? "is only 1" : `are only ${quantity}`}`;
  return list;
};

/** "Tolu 2, Bisi 2, 1 in store". */
const describeAssignments = (quantity: number, assignments: StoreItemAssignment[]) => {
  const inStore = quantity - assignments.reduce((sum, a) => sum + a.quantity, 0);
  return [
    ...assignments.map((a) => (quantity > 1 ? `${a.assignedTo} ${a.quantity}` : a.assignedTo)),
    ...(inStore > 0 && assignments.length > 0 ? [`${inStore} in store`] : []),
  ].join(", ");
};

/** Checks a store item sent by the form. Returns an error message when invalid. */
const readStoreItem = async (body: any): Promise<StoreItemInput | string> => {
  const name = String(body?.name ?? "").trim();
  const category = String(body?.category ?? "").trim();
  const quantity = Number(body?.quantity ?? 1);
  const rawCost = body?.unitCost;
  const unitCost =
    rawCost === undefined || rawCost === null || rawCost === "" ? null : Number(rawCost);
  const boughtOn = optionalText(body?.boughtOn);
  const status = String(body?.status ?? "in_use");
  const supplierId = optionalText(body?.supplierId);
  if (!name || !category) return "Item name and category are required";
  if (!Number.isInteger(quantity) || quantity < 1) return "Quantity must be a whole number of 1 or more";
  if (unitCost !== null && !(unitCost >= 0)) return "Cost must be a valid number";
  if (boughtOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(boughtOn) || Number.isNaN(new Date(boughtOn).getTime())))
    return "Choose a valid purchase date";
  if (!STORE_ITEM_STATUSES.includes(status)) return "Unknown status";
  const assignments = readAssignments(body?.assignments, quantity);
  if (typeof assignments === "string") return assignments;
  let supplierName: string | null = null;
  if (supplierId) {
    const found = await db.query<{ name: string }>("SELECT name FROM suppliers WHERE id = $1", [supplierId]);
    if (!found.rows[0]) return "Supplier not found";
    supplierName = found.rows[0].name;
  }
  return {
    name,
    category,
    quantity,
    unitCost: unitCost === null ? null : Math.round(unitCost * 100) / 100,
    boughtOn,
    supplierId,
    supplierName,
    serialNumber: optionalText(body?.serialNumber),
    assignments,
    status: status as StoreItemStatus,
    notes: optionalText(body?.notes),
  };
};

const storeItemValues = (item: StoreItemInput) => [
  item.name,
  item.category,
  item.quantity,
  item.unitCost,
  item.boughtOn,
  item.supplierId,
  item.supplierName,
  item.serialNumber,
  item.status,
  item.notes,
];

const describeItem = (item: { tag: string; name: string; quantity: number }) =>
  `${item.tag} ${item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name}`;

// Items with their assignments, in code order (BBA-0001, BBA-0002…) like a
// register. `id` limits it to one item.
const fetchStoreItems = async (client: PoolClient | typeof db, id?: string) =>
  (
    await client.query<StoreItemRow>(
      `SELECT s.*, COALESCE((
         SELECT json_agg(json_build_object('assignedTo', a.assigned_to, 'quantity', a.quantity)
                         ORDER BY a.line)
         FROM store_item_assignments a WHERE a.item_id = s.id), '[]') AS assignments
       FROM store_items s WHERE $1::text IS NULL OR s.id = $1
       ORDER BY s.created_at`,
      [id ?? null],
    )
  ).rows;

const saveAssignments = async (
  client: PoolClient,
  itemId: string,
  assignments: StoreItemAssignment[],
) => {
  await client.query("DELETE FROM store_item_assignments WHERE item_id = $1", [itemId]);
  for (const [line, a] of assignments.entries())
    await client.query(
      `INSERT INTO store_item_assignments (item_id, line, assigned_to, quantity)
       VALUES ($1, $2, $3, $4)`,
      [itemId, line, a.assignedTo, a.quantity],
    );
};

app.get("/store-items", adminOnly, async (_req, res) => {
  res.json((await fetchStoreItems(db)).map(toStoreItem));
});

// Adds an item. With `recordExpense`, the purchase is also saved in
// Expenses (paid by `paymentMethod`), so it isn't typed in twice.
app.post("/store-items", adminOnly, async (req, res) => {
  const item = await readStoreItem(req.body);
  if (typeof item === "string") {
    res.status(400).json({ error: item });
    return;
  }
  const recordExpense = req.body?.recordExpense === true;
  const paymentMethod = String(req.body?.paymentMethod ?? "");
  const total = item.unitCost === null ? 0 : item.unitCost * item.quantity;
  if (recordExpense) {
    if (!(total > 0)) {
      res.status(400).json({ error: "Enter what it cost to record it as an expense" });
      return;
    }
    if (!EXPENSE_PAYMENT_METHODS.includes(paymentMethod)) {
      res.status(400).json({ error: "Choose how it was paid for" });
      return;
    }
  }
  const saved = await transaction(async (client) => {
    const { rows } = await client.query<StoreItemRow>(
      `INSERT INTO store_items (id, name, category, quantity, unit_cost, bought_on,
         supplier_id, supplier_name, serial_number, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [randomUUID(), ...storeItemValues(item)],
    );
    await saveAssignments(client, rows[0].id, item.assignments);
    if (recordExpense) {
      await client.query(
        `INSERT INTO expenses (id, spent_on, description, category, amount,
           payment_method, supplier_id, supplier_name, notes)
         VALUES ($1, $2, $3, 'Equipment & store items', $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          item.boughtOn ?? new Date().toISOString().slice(0, 10),
          describeItem(rows[0]),
          Math.round(total * 100) / 100,
          paymentMethod,
          item.supplierId,
          item.supplierName,
          "Added from Store items",
        ],
      );
    }
    return (await fetchStoreItems(client, rows[0].id))[0];
  });
  const handedTo = describeAssignments(item.quantity, item.assignments);
  await logBy(
    res,
    "store_item_added",
    `Added ${describeItem(saved)} (${item.category})` +
      (handedTo ? `: ${handedTo}` : "") +
      (recordExpense ? `, recorded ${naira.format(total)} as an expense` : ""),
  );
  res.status(201).json(toStoreItem(saved));
});

app.put("/store-items/:id", adminOnly, async (req, res) => {
  const item = await readStoreItem(req.body);
  if (typeof item === "string") {
    res.status(400).json({ error: item });
    return;
  }
  const id = String(req.params.id);
  const saved = await transaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE store_items SET name = $2, category = $3, quantity = $4, unit_cost = $5,
         bought_on = $6, supplier_id = $7, supplier_name = $8, serial_number = $9,
         status = $10, notes = $11, updated_at = now()
       WHERE id = $1`,
      [id, ...storeItemValues(item)],
    );
    if (!rowCount) throw new HttpError(404, "Item not found");
    await saveAssignments(client, id, item.assignments);
    return (await fetchStoreItems(client, id))[0];
  });
  const handedTo = describeAssignments(item.quantity, item.assignments);
  await logBy(
    res,
    "store_item_updated",
    `Updated ${describeItem(saved)} (${item.status.replace("_", " ")})` +
      (handedTo ? `: ${handedTo}` : ""),
  );
  res.json(toStoreItem(saved));
});

app.delete("/store-items/:id", adminOnly, async (req, res) => {
  const { rows } = await db.query<{ tag: string; name: string; quantity: number }>(
    "DELETE FROM store_items WHERE id = $1 RETURNING tag, name, quantity",
    [req.params.id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  await logBy(res, "store_item_removed", `Removed ${describeItem(rows[0])}`);
  res.sendStatus(204);
});

const errorHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err?.code === "23505") {
    // A unique column clashed, e.g. two people adding the same SKU at once.
    res
      .status(409)
      .json({ error: "That SKU or barcode is already used by another product" });
  } else if (typeof err?.status === "number" && err.status < 500) {
    // Bad request bodies, such as invalid JSON.
    res.status(err.status).json({ error: err.message });
  } else {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server" });
  }
};
app.use(errorHandler);

app.listen(port, () => {
  console.log(`sync-api listening on http://localhost:${port}`);
});

// --- Website sync ----------------------------------------------------------

// Backup for missed webhooks: copies names, selling prices, photos and new
// products from the online shop once a night at 1am Lagos time. Stock, cost
// prices and barcodes are never touched. The free host sleeps when idle, so
// a missed night is caught up soon after the server next wakes. Set
// WOOCOMMERCE_SYNC=off to stop it, or WOOCOMMERCE_SYNC_HOUR to change 1am.
const SYNC_HOUR = Number(process.env.WOOCOMMERCE_SYNC_HOUR ?? 1);
const HOUR_MS = 3600_000;
const lagosHour = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Africa/Lagos",
    }).format(new Date()),
  );

let syncing = false;
let lastAttempt = 0;
const nightlySync = async () => {
  // After a failure, wait an hour before trying again.
  if (syncing || Date.now() - lastAttempt < HOUR_MS) return;
  syncing = true;
  try {
    const last = (
      await db.query<{ last_full_sync: Date }>(
        "SELECT last_full_sync FROM woocommerce_sync",
      )
    ).rows[0]?.last_full_sync;
    const age = last ? Date.now() - last.getTime() : Infinity;
    const due =
      (lagosHour() === SYNC_HOUR && age > 2 * HOUR_MS) || age > 25 * HOUR_MS;
    if (!due) return;
    lastAttempt = Date.now();
    const { added, updated, skipped } = await syncFromWooCommerce();
    await db.query(
      `INSERT INTO woocommerce_sync (id, last_full_sync) VALUES (true, now())
       ON CONFLICT (id) DO UPDATE SET last_full_sync = now()`,
    );
    console.log(
      `Website sync: ${added} added, ${updated} updated, ${skipped.length} skipped.`,
    );
  } catch (err) {
    // A slow or offline website just means trying again later.
    console.error("Website sync failed; will try again later:", err);
  } finally {
    syncing = false;
  }
};

if (process.env.WOOCOMMERCE_SYNC !== "off") {
  // Shortly after starting (to catch up a missed night), then every 10 minutes.
  setTimeout(nightlySync, 60_000);
  setInterval(nightlySync, 10 * 60_000);
}
