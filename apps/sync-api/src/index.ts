import { db, transaction } from "./db";
import express from "express";
import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type {
  CloudinaryUrl,
  Customer,
  Inventory,
  Order,
  OrderItem,
  PaymentMethod,
  Product,
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
  quantity: number;
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

// The admin logs in with ADMIN_PASSWORD; cashiers log in with a PIN the admin
// gives them. Cashiers can only see products and make sales.
type Role = "admin" | "cashier";
type Session = { role: Role; name: string; cashierId?: string; exp: number };
type Cashier = { id: string; name: string; salt: string; pin_hash: string };

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
if (!ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD is not set, so the admin cannot log in.");
}
// Without a fixed SESSION_SECRET everyone is logged out when the server restarts.
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");
const SESSION_HOURS = 12;

const fetchCashiers = async () =>
  (await db.query<Cashier>("SELECT * FROM cashiers ORDER BY created_at")).rows;

const hashPin = (pin: string, salt: string) =>
  scryptSync(pin, salt, 32).toString("hex");

const pinMatches = (cashier: Cashier, pin: string) =>
  timingSafeEqual(
    Buffer.from(hashPin(pin, cashier.salt), "hex"),
    Buffer.from(cashier.pin_hash, "hex"),
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
  // A removed cashier is logged out straight away.
  if (session.role === "cashier") {
    const { rowCount } = await db.query("SELECT 1 FROM cashiers WHERE id = $1", [
      session.cashierId,
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
    next();
  };

const anyone = requireRole("admin", "cashier");
const adminOnly = requireRole("admin");

// PINs are short, so lock a device out after too many wrong attempts.
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const failedLogins = new Map<string, { count: number; until: number }>();

// The cashier terminal runs on another origin (localhost:3000 / tauri://localhost).
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
    const cashier = (await fetchCashiers()).find((c) => pinMatches(c, pin));
    if (cashier)
      session = { role: "cashier", name: cashier.name, cashierId: cashier.id };
  }

  if (!session) {
    const count = failed && failed.until > Date.now() ? failed.count + 1 : 1;
    failedLogins.set(key, {
      count,
      until: Date.now() + LOCKOUT_MINUTES * 60_000,
    });
    res
      .status(401)
      .json({ error: password ? "Wrong password" : "Wrong PIN" });
    return;
  }
  failedLogins.delete(key);
  res.json({ token: createToken(session), role: session.role, name: session.name });
});

app.get("/cashiers", adminOnly, async (_req, res) => {
  res.json((await fetchCashiers()).map(({ id, name }) => ({ id, name })));
});

app.post("/cashiers", adminOnly, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const pin = String(req.body?.pin ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Cashier name is required" });
    return;
  }
  if (!/^\d{4,8}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be 4 to 8 digits" });
    return;
  }
  // Cashiers log in with the PIN alone, so each one must be different.
  if ((await fetchCashiers()).some((c) => pinMatches(c, pin))) {
    res.status(409).json({ error: "Another cashier already uses that PIN" });
    return;
  }
  const salt = randomBytes(16).toString("hex");
  const id = randomUUID();
  await db.query(
    "INSERT INTO cashiers (id, name, salt, pin_hash) VALUES ($1, $2, $3, $4)",
    [id, name, salt, hashPin(pin, salt)],
  );
  res.status(201).json({ id, name });
});

app.delete("/cashiers/:id", adminOnly, async (req, res) => {
  const { rowCount } = await db.query("DELETE FROM cashiers WHERE id = $1", [
    req.params.id,
  ]);
  if (!rowCount) {
    res.status(404).json({ error: "Cashier not found" });
    return;
  }
  res.sendStatus(204);
});

app.get("/products", anyone, async (_req, res) => {
  const { rows } = await db.query<ProductRow>(
    "SELECT * FROM products ORDER BY created_at",
  );
  res.json(rows.map(toProduct));
});

type ProductInput = Omit<Product, "id"> & { quantity: number };

// Validates a product sent by the add / edit forms. Returns an error message
// when the input is invalid.
const readProductInput = (body: any): ProductInput | string => {
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

  return {
    sku,
    name,
    price,
    quantity,
    ...(hasCost ? { costPrice } : {}),
    ...(barcode ? { barcode } : {}),
    ...(imageUrl ? { imageUrl: imageUrl as CloudinaryUrl } : {}),
  };
};

// SKUs and barcodes must be unique; `exceptId` is the product being edited.
const findConflict = async (input: ProductInput, exceptId = "") => {
  const { rows } = await db.query<{ sku: string; barcode: string | null }>(
    "SELECT sku, barcode FROM products WHERE id <> $1 AND (sku = $2 OR barcode = $3)",
    [exceptId, input.sku, input.barcode ?? null],
  );
  if (rows.some((p) => p.sku === input.sku))
    return `A product with SKU ${input.sku} already exists`;
  if (rows.length > 0)
    return `A product with barcode ${input.barcode} already exists`;
  return null;
};

const productValues = (input: ProductInput) => [
  input.sku,
  input.name,
  input.price,
  input.costPrice ?? null,
  input.barcode ?? null,
  input.imageUrl ?? null,
  input.quantity,
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

  const { rows } = await db.query<ProductRow>(
    `INSERT INTO products (sku, name, price, cost_price, barcode, image_url, quantity, id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [...productValues(input), randomUUID()],
  );
  res.status(201).json(toProduct(rows[0]));
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

  // Past orders keep their own copy of the name and prices, so they are
  // unaffected. Optional fields left empty are removed.
  const { rows } = await db.query<ProductRow>(
    `UPDATE products SET sku = $1, name = $2, price = $3, cost_price = $4,
       barcode = $5, image_url = $6, quantity = $7, updated_at = now()
     WHERE id = $8 RETURNING *`,
    [...productValues(input), id],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(toProduct(rows[0]));
});

app.get("/inventory", anyone, async (_req, res) => {
  const { rows } = await db.query<ProductRow>(
    "SELECT id, quantity, updated_at FROM products ORDER BY created_at",
  );
  res.json(
    rows.map(
      (row): Inventory => ({
        productId: row.id,
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

  const errors: { row: number; message: string }[] = [];
  const valid: ProductInput[] = [];
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
    const fail = (message: string) => errors.push({ row: rowNumber, message });

    if (!sku) return fail("SKU is empty");
    if (seen.has(sku)) return fail(`SKU ${sku} appears more than once`);
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
    });
  });

  if (valid.length === 0) {
    res.status(400).json({ error: "No valid product rows found", errors });
    return;
  }

  // One statement for the whole file. Products are matched by SKU; columns
  // missing from the file keep their current values.
  const result = await db.query<{ inserted: boolean }>(
    `INSERT INTO products (id, sku, name, price, cost_price, barcode, image_url, quantity)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[],
                          $5::numeric[], $6::text[], $7::text[], $8::int[])
     ON CONFLICT (sku) DO UPDATE SET
       name = EXCLUDED.name,
       price = EXCLUDED.price,
       cost_price = COALESCE(EXCLUDED.cost_price, products.cost_price),
       barcode = COALESCE(EXCLUDED.barcode, products.barcode),
       image_url = COALESCE(EXCLUDED.image_url, products.image_url),
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
    ],
  );
  const added = result.rows.filter((r) => r.inserted).length;
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
  res.status(201).json(customer);
});

app.get("/orders", adminOnly, async (_req, res) => {
  const { rows } = await db.query<{
    id: string;
    total: number;
    payment_method: PaymentMethod;
    customer_name: string;
    customer_phone: string;
    customer_email: string | null;
    created_at: Date;
    items: OrderItem[];
  }>(
    `SELECT o.*, json_agg(json_strip_nulls(json_build_object(
         'productId', i.product_id, 'name', i.name, 'quantity', i.quantity,
         'unitPrice', i.unit_price, 'unitCost', i.unit_cost)) ORDER BY i.line) AS items
     FROM orders o JOIN order_items i ON i.order_id = o.id
     GROUP BY o.id ORDER BY o.created_at`,
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
        createdAt: row.created_at.toISOString(),
      }),
    ),
  );
});

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
  const customer: Customer = { name, phone, ...(email ? { email } : {}) };

  // Sales recorded in the back office may carry the date they happened.
  let createdAt = new Date();
  if (req.body?.createdAt) {
    createdAt = new Date(String(req.body.createdAt));
    if (Number.isNaN(createdAt.getTime()) || createdAt.getTime() > Date.now()) {
      res.status(400).json({ error: "Sale date must be a valid past date" });
      return;
    }
  }

  // Taking the stock and saving the sale happen together, so two tills
  // selling the last item at once can't both succeed.
  const order = await transaction(async (client) => {
    const items: OrderItem[] = [];
    for (const line of requested) {
      const productId = String(line?.productId ?? "");
      const quantity = Number(line?.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0)
        throw new HttpError(400, "Invalid order item");
      const { rows } = await client.query<ProductRow>(
        `UPDATE products SET quantity = quantity - $2, updated_at = now()
         WHERE id = $1 AND quantity >= $2 RETURNING *`,
        [productId, quantity],
      );
      if (rows.length === 0) {
        const found = await client.query<{ name: string }>(
          "SELECT name FROM products WHERE id = $1",
          [productId],
        );
        throw found.rows.length
          ? new HttpError(409, `Not enough stock for ${found.rows[0].name}`)
          : new HttpError(400, "Invalid order item");
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

    const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const order: Order = {
      id: randomUUID(),
      items,
      total: Math.round(total * 100) / 100,
      paymentMethod: paymentMethod satisfies PaymentMethod,
      customer,
      createdAt: createdAt.toISOString(),
    };
    await client.query(
      `INSERT INTO orders (id, total, payment_method, customer_name, customer_phone, customer_email, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [order.id, order.total, paymentMethod, name, phone, email || null, createdAt],
    );
    for (const [line, item] of items.entries()) {
      await client.query(
        `INSERT INTO order_items (order_id, line, product_id, name, quantity, unit_price, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.id,
          line,
          item.productId,
          item.name,
          item.quantity,
          item.unitPrice,
          item.unitCost ?? null,
        ],
      );
    }
    // Save the customer, keeping a known email if none was given this time.
    await client.query(
      `INSERT INTO customers (phone_key, name, phone, email) VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone_key) DO UPDATE SET name = EXCLUDED.name,
         phone = EXCLUDED.phone, email = COALESCE(EXCLUDED.email, customers.email)`,
      [phoneKey(phone), name, phone, email || null],
    );
    return order;
  });
  res.status(201).json(order);
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
