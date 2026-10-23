"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Customer,
  Order,
  PaymentMethod,
  Product,
} from "@pos/types";
import Link from "next/link";
import { flushSync } from "react-dom";
import Receipt from "../components/receipt";
import { API_URL, apiFetch, fetchCatalog, money } from "../lib/api";
import { getSession, logOut } from "../lib/auth";

// Set NEXT_PUBLIC_AUTO_PRINT_RECEIPT=false to print only when asked.
const AUTO_PRINT = process.env.NEXT_PUBLIC_AUTO_PRINT_RECEIPT !== "false";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  transfer: "Bank transfer",
  card: "Card",
};

const EMPTY_CUSTOMER: Customer = { name: "", phone: "", email: "" };

type CheckoutStep = "payment" | "customer";

export default function CashierTerminal() {
  // RequireLogin only renders this page once someone is logged in.
  const session = getSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [charging, setCharging] = useState(false);
  const [step, setStep] = useState<CheckoutStep | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetchCatalog()
        .then((catalog) => {
          setProducts(catalog.products);
          setStock(catalog.stock);
          setError(null);
        })
        .catch(() => {
          setError(`Cannot reach the sync API at ${API_URL}. Is it running?`);
        })
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const lines = products
    .filter((p) => cart[p.id])
    .map((p) => ({ product: p, quantity: cart[p.id] }));
  const total = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);

  const setQuantity = (id: string, quantity: number) => {
    setLastOrder(null);
    setCart((current) => {
      const next = { ...current };
      const capped = Math.min(quantity, stock[id] ?? 0);
      if (capped <= 0) delete next[id];
      else next[id] = capped;
      return next;
    });
  };

  // A barcode scanner types the code into the search box and presses Enter.
  const addScanned = () => {
    const code = search.trim().toLowerCase();
    if (!code) return;
    const match = products.find(
      (p) =>
        p.barcode?.toLowerCase() === code || p.sku.toLowerCase() === code,
    );
    if (!match) return;
    setQuantity(match.id, (cart[match.id] ?? 0) + 1);
    setSearch("");
  };

  const startCheckout = () => {
    setPaymentMethod(null);
    setCustomer(EMPTY_CUSTOMER);
    setCheckoutError(null);
    setStep("payment");
  };

  const customerValid =
    customer.name.trim() !== "" && customer.phone.trim() !== "";

  const completeSale = async () => {
    if (!paymentMethod || !customerValid) return;
    setCharging(true);
    setCheckoutError(null);
    try {
      const res = await apiFetch("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          customer,
          items: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Order failed");
      // Render the receipt now so the print dialog shows this sale.
      flushSync(() => setLastOrder(body as Order));
      if (AUTO_PRINT) window.print();
      setCart({});
      setStep(null);
      await load();
    } catch (e) {
      setCheckoutError(
        e instanceof TypeError
          ? `Cannot reach the sync API at ${API_URL}.`
          : e instanceof Error
            ? e.message
            : "Order failed",
      );
    } finally {
      setCharging(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-100 text-zinc-900 print:block print:h-auto print:bg-white">
      <header className="flex items-center print:hidden gap-4 bg-zinc-900 px-6 py-3 text-white">
        <h1 className="text-lg font-semibold">Point of sale</h1>
        {session?.role === "admin" && (
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-zinc-800"
          >
            ← Back office
          </Link>
        )}
        <input
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addScanned();
          }}
          placeholder="Scan barcode or search by name or SKU"
          className="ml-auto w-72 rounded-md bg-zinc-800 px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-emerald-500"
        />
        <span className="text-sm text-zinc-400">{session?.name}</span>
        <button
          onClick={logOut}
          className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-zinc-800"
        >
          Log out
        </button>
      </header>

      {error && (
        <div className="flex items-center justify-between bg-red-100 print:hidden px-6 py-2 text-sm text-red-800">
          <span>{error}</span>
          <button onClick={() => void load()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 print:hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-zinc-500">Loading products…</p>
          ) : visible.length === 0 ? (
            <p className="text-zinc-500">No products found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => {
                const left = (stock[p.id] ?? 0) - (cart[p.id] ?? 0);
                return (
                  <button
                    key={p.id}
                    disabled={left <= 0}
                    onClick={() => setQuantity(p.id, (cart[p.id] ?? 0) + 1)}
                    className="flex flex-col rounded-lg bg-white p-4 text-left shadow-sm transition hover:shadow-md active:scale-[0.98] disabled:opacity-40"
                  >
                    {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="mb-3 aspect-square w-full rounded-md object-cover"
                    />
                  ) : (
                    <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-md bg-zinc-100 text-3xl font-semibold text-zinc-300">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs text-zinc-500">{p.sku}</span>
                    <span className="mt-1 font-medium">{p.name}</span>
                    <span className="mt-4 text-lg font-semibold">
                      {money.format(p.price)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {left > 0 ? `${left} in stock` : "Out of stock"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        <aside className="flex w-96 flex-col border-l border-zinc-200 bg-white">
          <h2 className="border-b border-zinc-200 px-5 py-4 font-semibold">
            Current sale
          </h2>
          <div className="flex-1 overflow-y-auto px-5">
            {lines.length === 0 ? (
              <div className="py-6">
                <p className="text-sm text-zinc-500">
                  {lastOrder
                    ? `Sale complete — ${money.format(lastOrder.total)} paid by ${PAYMENT_LABELS[
                        lastOrder.paymentMethod
                      ].toLowerCase()} for ${lastOrder.customer.name}.`
                    : "Tap a product to add it to the sale."}
                </p>
                {lastOrder && (
                  <button
                    onClick={() => window.print()}
                    className="mt-3 w-full rounded-lg border border-zinc-300 py-2 text-sm font-medium hover:bg-zinc-100"
                  >
                    Print receipt
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {lines.map(({ product, quantity }) => (
                  <li key={product.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {product.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {money.format(product.price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        aria-label={`Remove one ${product.name}`}
                        onClick={() => setQuantity(product.id, quantity - 1)}
                        className="h-8 w-8 rounded-md bg-zinc-100 font-semibold hover:bg-zinc-200"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm">{quantity}</span>
                      <button
                        aria-label={`Add one ${product.name}`}
                        onClick={() => setQuantity(product.id, quantity + 1)}
                        className="h-8 w-8 rounded-md bg-zinc-100 font-semibold hover:bg-zinc-200"
                      >
                        +
                      </button>
                    </div>
                    <span className="w-16 text-right text-sm font-medium">
                      {money.format(product.price * quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-zinc-200 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-zinc-500">Total</span>
              <span className="text-2xl font-semibold">
                {money.format(total)}
              </span>
            </div>
            <button
              disabled={lines.length === 0 || charging}
              onClick={startCheckout}
              className="mt-4 w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Charge
            </button>
            <button
              disabled={lines.length === 0 || charging}
              onClick={() => setCart({})}
              className="mt-2 w-full rounded-lg py-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
            >
              Clear sale
            </button>
          </div>
        </aside>
      </div>

      {step && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-6 print:hidden">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Step {step === "payment" ? 1 : 2} of 2 · {money.format(total)}
            </p>

            {step === "payment" ? (
              <>
                <h2 className="mt-1 text-xl font-semibold">
                  How is the customer paying?
                </h2>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setPaymentMethod(m);
                        setStep("customer");
                      }}
                      className={`rounded-lg border-2 py-8 text-lg font-semibold hover:border-emerald-600 hover:bg-emerald-50 ${
                        paymentMethod === m
                          ? "border-emerald-600 bg-emerald-50"
                          : "border-zinc-200"
                      }`}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep(null)}
                  className="mt-4 w-full rounded-lg py-2 text-sm text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void completeSale();
                }}
              >
                <h2 className="mt-1 text-xl font-semibold">Customer details</h2>
                <p className="text-sm text-zinc-500">
                  Paying by{" "}
                  {paymentMethod && PAYMENT_LABELS[paymentMethod].toLowerCase()}
                </p>
                <label className="mt-4 block text-sm font-medium">
                  Full name
                  <input
                    autoFocus
                    required
                    value={customer.name}
                    onChange={(e) =>
                      setCustomer({ ...customer, name: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium">
                  Phone number
                  <input
                    required
                    type="tel"
                    value={customer.phone}
                    onChange={(e) =>
                      setCustomer({ ...customer, phone: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium">
                  Email <span className="font-normal text-zinc-500">(optional)</span>
                  <input
                    type="email"
                    value={customer.email ?? ""}
                    onChange={(e) =>
                      setCustomer({ ...customer, email: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                {checkoutError && (
                  <p className="mt-3 text-sm text-red-700">{checkoutError}</p>
                )}
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    disabled={charging}
                    onClick={() => setStep("payment")}
                    className="flex-1 rounded-lg bg-zinc-100 py-3 font-medium hover:bg-zinc-200 disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={!customerValid || charging}
                    className="flex-1 rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {charging ? "Completing…" : "Complete sale"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {lastOrder && (
        <Receipt
          order={lastOrder}
          productNames={Object.fromEntries(products.map((p) => [p.id, p.name]))}
        />
      )}
    </div>
  );
}
