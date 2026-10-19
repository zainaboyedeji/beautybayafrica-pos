"use client";

import { useCallback, useEffect, useState } from "react";
import type { Customer, Inventory, Order, Product } from "@pos/types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: process.env.NEXT_PUBLIC_CURRENCY ?? "NGN",
});

export type Catalog = { products: Product[]; stock: Record<string, number> };

export async function fetchCatalog(): Promise<Catalog> {
  const [productsRes, inventoryRes] = await Promise.all([
    fetch(`${API_URL}/products`),
    fetch(`${API_URL}/inventory`),
  ]);
  if (!productsRes.ok || !inventoryRes.ok)
    throw new Error("Catalog request failed");
  const products: Product[] = await productsRes.json();
  const inventory: Inventory[] = await inventoryRes.json();
  return {
    products,
    stock: Object.fromEntries(inventory.map((i) => [i.productId, i.quantity])),
  };
}

export async function fetchOrders(): Promise<Order[]> {
  const res = await fetch(`${API_URL}/orders`);
  if (!res.ok) throw new Error("Orders request failed");
  return res.json();
}

export async function fetchCustomers(): Promise<Customer[]> {
  const res = await fetch(`${API_URL}/customers`);
  if (!res.ok) throw new Error("Customers request failed");
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
        lastPurchase: theirs.map((o) => o.createdAt).sort().at(-1),
      };
    })
    .sort((a, b) => (b.lastPurchase ?? "").localeCompare(a.lastPurchase ?? ""));
}
