"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Customer,
  Expense,
  Inventory,
  Order,
  Product,
  ProductVariant,
  StoreRequest,
  Supplier,
} from "@pos/types";
import { getSession, logOut } from "./auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: process.env.NEXT_PUBLIC_CURRENCY ?? "NGN",
});

/** Calls the sync API as the logged-in user. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getSession()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  // The login has expired or the staff member was removed.
  if (res.status === 401) {
    logOut();
    throw new Error("Please log in again");
  }
  return res;
}

/** Someone who logs in with a PIN, with their job title. */
export type StaffMember = { id: string; name: string; role?: string };

/**
 * Stock by product id, and by option id for products with options (their
 * product id then holds the total).
 */
export type Catalog = { products: Product[]; stock: Record<string, number> };

/** Something the till can sell: a product, or one option of a product. */
export type Sellable = {
  /** The option id, or the product id for a product without options. */
  key: string;
  product: Product;
  variant?: ProductVariant;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
};

export const sellables = (product: Product): Sellable[] =>
  product.variants?.length
    ? product.variants.map((variant) => ({
        key: variant.id,
        product,
        variant,
        name: `${product.name} — ${variant.name}`,
        sku: variant.sku,
        barcode: variant.barcode,
        price: variant.price,
      }))
    : [
        {
          key: product.id,
          product,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: product.price,
        },
      ];

/** The sale line to send to the API for a sellable. */
export const orderItem = (s: Sellable, quantity: number) => ({
  productId: s.product.id,
  ...(s.variant ? { variantId: s.variant.id } : {}),
  quantity,
});

/** The categories in use, in alphabetical order. */
export const categoryList = (products: Product[]) =>
  [...new Set(products.flatMap((p) => p.category ?? []))].sort((a, b) =>
    a.localeCompare(b),
  );

export async function fetchCatalog(): Promise<Catalog> {
  const [productsRes, inventoryRes] = await Promise.all([
    apiFetch("/products"),
    apiFetch("/inventory"),
  ]);
  if (!productsRes.ok || !inventoryRes.ok)
    throw new Error("Catalog request failed");
  const products: Product[] = await productsRes.json();
  const inventory: Inventory[] = await inventoryRes.json();
  return {
    products,
    stock: Object.fromEntries(
      inventory.map((i) => [i.variantId ?? i.productId, i.quantity]),
    ),
  };
}

export async function fetchOrders(): Promise<Order[]> {
  const res = await apiFetch("/orders");
  if (!res.ok) throw new Error("Orders request failed");
  return res.json();
}

export async function fetchCustomers(): Promise<Customer[]> {
  const res = await apiFetch("/customers");
  if (!res.ok) throw new Error("Customers request failed");
  return res.json();
}

export async function fetchStaff(): Promise<StaffMember[]> {
  const res = await apiFetch("/staff");
  if (!res.ok) throw new Error("Staff request failed");
  return res.json();
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const res = await apiFetch("/suppliers");
  if (!res.ok) throw new Error("Suppliers request failed");
  return res.json();
}

export async function fetchExpenses(): Promise<Expense[]> {
  const res = await apiFetch("/expenses");
  if (!res.ok) throw new Error("Expenses request failed");
  return res.json();
}

export async function fetchRequests(): Promise<StoreRequest[]> {
  const res = await apiFetch("/requests");
  if (!res.ok) throw new Error("Requests request failed");
  return res.json();
}

export async function fetchMyRequests(): Promise<StoreRequest[]> {
  const res = await apiFetch("/requests/mine");
  if (!res.ok) throw new Error("Requests request failed");
  return res.json();
}

export const describeError = (e: unknown, fallback: string) =>
  e instanceof TypeError
    ? `Cannot reach the sync API at ${API_URL}.`
    : e instanceof Error
      ? e.message
      : fallback;

/** Loads data on mount. `loader` must be a stable (module-level) function. */
export function useLoad<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(
    () =>
      loader()
        .then((result) => {
          setData(result);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    [loader],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, failed, reload };
}

export type CustomerSummary = Customer & {
  orders: number;
  totalSpent: number;
  lastPurchase?: string;
};

const phoneKey = (phone: string) => phone.replace(/\s+/g, "");

/** One row per saved customer, with totals from their sales (matched by phone). */
export function summariseCustomers(
  customers: Customer[],
  orders: Order[],
): CustomerSummary[] {
  return customers
    .map((customer) => {
      const theirs = orders.filter(
        (o) => phoneKey(o.customer.phone) === phoneKey(customer.phone),
      );
      return {
        ...customer,
        orders: theirs.length,
        totalSpent: theirs.reduce((sum, o) => sum + o.total, 0),
        lastPurchase: theirs
          .map((o) => o.createdAt)
          .sort()
          .at(-1),
      };
    })
    .sort((a, b) => (b.lastPurchase ?? "").localeCompare(a.lastPurchase ?? ""));
}
