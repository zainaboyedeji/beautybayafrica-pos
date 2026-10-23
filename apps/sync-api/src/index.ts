import express from "express";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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

// Orders, products and stock are kept in local JSON files so they survive
// restarts. Replace with a real database before going live.
const dataDir = path.resolve(process.env.DATA_DIR ?? "data");
const catalogFile = path.join(dataDir, "catalog.json");

// Sample data, used only until a real inventory file is imported.
const sampleProducts: Product[] = [
  { id: "p1", sku: "BEV-001", name: "Bottled Water 75cl", price: 1.5 },
  { id: "p2", sku: "BEV-002", name: "Orange Juice 1L", price: 3.2 },
  { id: "p3", sku: "BEV-003", name: "Cola Can 33cl", price: 1.2 },
  { id: "p4", sku: "SNK-001", name: "Potato Chips", price: 2.0 },
  { id: "p5", sku: "SNK-002", name: "Chocolate Bar", price: 1.8 },
  { id: "p6", sku: "SNK-003", name: "Salted Peanuts", price: 2.5 },
  { id: "p7", sku: "GRO-001", name: "White Bread Loaf", price: 2.7 },
  { id: "p8", sku: "GRO-002", name: "Milk 1L", price: 1.9 },
  { id: "p9", sku: "GRO-003", name: "Eggs (12)", price: 4.5 },
  { id: "p10", sku: "GRO-004", name: "Rice 1kg", price: 3.8 },
  { id: "p11", sku: "HOM-001", name: "Dish Soap", price: 2.9 },
  { id: "p12", sku: "HOM-002", name: "Toilet Paper (4)", price: 3.5 },
];

type CatalogEntry = Product & { quantity: number };

let usingSampleData = !existsSync(catalogFile);
const savedCatalog: CatalogEntry[] = usingSampleData
  ? sampleProducts.map((p) => ({ ...p, quantity: 25 }))
  : JSON.parse(readFileSync(catalogFile, "utf8"));

const products: Product[] = savedCatalog.map(({ quantity: _q, ...p }) => p);
const stock = new Map<string, number>(
  savedCatalog.map((entry) => [entry.id, entry.quantity]),
);

const saveCatalog = () => {
  if (usingSampleData) return;
  const catalog: CatalogEntry[] = products.map((p) => ({
    ...p,
    quantity: stock.get(p.id) ?? 0,
  }));
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(catalogFile, JSON.stringify(catalog, null, 2));
};

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
  const input = text.replace(/^\uFEFF/, "");
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

const ordersFile = path.join(dataDir, "orders.json");
const orders: Order[] = existsSync(ordersFile)
  ? JSON.parse(readFileSync(ordersFile, "utf8"))
  : [];

const saveOrders = () => {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
};

// Customers are matched by phone number (ignoring spaces).
const customersFile = path.join(dataDir, "customers.json");
const customers: Customer[] = existsSync(customersFile)
  ? JSON.parse(readFileSync(customersFile, "utf8"))
  : [];

const phoneKey = (phone: string) => phone.replace(/\s+/g, "");
const findCustomer = (phone: string) =>
  customers.find((c) => phoneKey(c.phone) === phoneKey(phone));

const saveCustomers = () => {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(customersFile, JSON.stringify(customers, null, 2));
};

const upsertCustomer = (customer: Customer) => {
  const existing = findCustomer(customer.phone);
  if (existing) Object.assign(existing, customer);
  else customers.push({ ...customer });
  saveCustomers();
};

// Customers from sales made before the customer list existed.
for (const order of orders) {
  if (!findCustomer(order.customer.phone)) customers.push({ ...order.customer });
}

const inventory = (): Inventory[] =>
  products.map((p) => ({
    productId: p.id,
    quantity: stock.get(p.id) ?? 0,
    updatedAt: new Date().toISOString(),
  }));

// The cashier terminal runs on another origin (localhost:3000 / tauri://localhost).
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json());
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/products", (_req, res) => {
  res.json(products);
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
const findConflict = (input: ProductInput, exceptId?: string) => {
  const others = products.filter((p) => p.id !== exceptId);
  if (others.some((p) => p.sku === input.sku))
    return `A product with SKU ${input.sku} already exists`;
  if (input.barcode && others.some((p) => p.barcode === input.barcode))
    return `A product with barcode ${input.barcode} already exists`;
  return null;
};

app.post("/products", (req, res) => {
  const input = readProductInput(req.body);
  if (typeof input === "string") {
    res.status(400).json({ error: input });
    return;
  }

  // The first real product replaces the sample products entirely.
  if (usingSampleData) {
    products.length = 0;
    stock.clear();
    usingSampleData = false;
  }
  const conflict = findConflict(input);
  if (conflict) {
    res.status(409).json({ error: conflict });
    return;
  }

  const { quantity, ...fields } = input;
  const product: Product = { id: randomUUID(), ...fields };
  products.push(product);
  stock.set(product.id, quantity);
  saveCatalog();
  res.status(201).json(product);
});

app.put("/products/:id", (req, res) => {
  const index = products.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const input = readProductInput(req.body);
  if (typeof input === "string") {
    res.status(400).json({ error: input });
    return;
  }
  const conflict = findConflict(input, req.params.id);
  if (conflict) {
    res.status(409).json({ error: conflict });
    return;
  }

  // Past orders keep their own copy of the name and prices, so they are
  // unaffected. Optional fields left empty are removed.
  const { quantity, ...fields } = input;
  const product: Product = { id: req.params.id, ...fields };
  products[index] = product;
  stock.set(product.id, quantity);
  // Editing a sample product means the admin is keeping it, so start saving.
  usingSampleData = false;
  saveCatalog();
  res.json(product);
});

app.get("/inventory", (_req, res) => {
  res.json(inventory());
});

app.post("/inventory/import", (req, res) => {
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

  const errors: { row: number; message: string }[] = [];
  const valid: CatalogEntry[] = [];
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
    if (barcode && products.some((p) => p.barcode === barcode && p.sku !== sku))
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
      id: "",
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

  // The first real import replaces the sample products entirely.
  if (usingSampleData) {
    products.length = 0;
    stock.clear();
    usingSampleData = false;
  }

  let added = 0;
  let updated = 0;
  for (const { quantity, id: _id, ...fields } of valid) {
    const existing = products.find((p) => p.sku === fields.sku);
    if (existing) {
      Object.assign(existing, fields);
      stock.set(existing.id, quantity);
      updated++;
    } else {
      const product: Product = { ...fields, id: randomUUID() };
      products.push(product);
      stock.set(product.id, quantity);
      added++;
    }
  }
  saveCatalog();
  res.json({ added, updated, skipped: errors.length, errors });
});

app.get("/customers", (_req, res) => {
  res.json(customers);
});

app.post("/customers", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  if (!name || !phone) {
    res.status(400).json({ error: "Customer name and phone are required" });
    return;
  }
  if (findCustomer(phone)) {
    res
      .status(409)
      .json({ error: `A customer with phone ${phone} already exists` });
    return;
  }
  const customer: Customer = { name, phone, ...(email ? { email } : {}) };
  customers.push(customer);
  saveCustomers();
  res.status(201).json(customer);
});

app.get("/orders", (_req, res) => {
  res.json(orders);
});

app.post("/orders", (req, res) => {
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

  const items: OrderItem[] = [];
  for (const line of requested) {
    const product = products.find((p) => p.id === line?.productId);
    const quantity = Number(line?.quantity);
    if (!product || !Number.isInteger(quantity) || quantity <= 0) {
      res.status(400).json({ error: "Invalid order item" });
      return;
    }
    if ((stock.get(product.id) ?? 0) < quantity) {
      res.status(409).json({ error: `Not enough stock for ${product.name}` });
      return;
    }
    items.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      ...(product.costPrice !== undefined
        ? { unitCost: product.costPrice }
        : {}),
    });
  }

  for (const item of items) {
    stock.set(item.productId, (stock.get(item.productId) ?? 0) - item.quantity);
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
  orders.push(order);
  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  upsertCustomer(customer);
  saveOrders();
  saveCatalog();
  res.status(201).json(order);
});

app.listen(port, () => {
  console.log(`sync-api listening on http://localhost:${port}`);
});
