"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer, Order, PaymentMethod, Product } from "@pos/types";
import Link from "next/link";
import { flushSync } from "react-dom";
import Receipt from "../components/receipt";
import {
  API_URL,
  apiFetch,
  fetchCatalog,
  money,
  orderItem,
  sellables,
} from "../lib/api";
import { getSession, logOut } from "../lib/auth";
import { printPage } from "../lib/print";

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
  // Quantities by product id, or by option id for products with options.
  const [cart, setCart] = useState<Record<string, number>>({});
  // The product whose options are being chosen from.
  const [picking, setPicking] = useState<Product | null>(null);
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
  // A saved customer with the phone number typed in, waiting for the
  // cashier to say whether it's the same person.
  const [existing, setExisting] = useState<Customer | null>(null);
  // The phone number already checked, so the cashier is asked only once.
  const [checkedPhone, setCheckedPhone] = useState<string | null>(null);

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

  const items = useMemo(() => products.flatMap(sellables), [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p, ...(p.variants ?? [])].some(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          x.sku.toLowerCase().includes(q) ||
          (x.barcode ?? "").toLowerCase().includes(q),
      ),
    );
  }, [products, search]);

  const lines = items
    .filter((s) => cart[s.key])
    .map((s) => ({ item: s, quantity: cart[s.key] }));
  const total = lines.reduce((sum, l) => sum + l.item.price * l.quantity, 0);

  const left = (key: string) => (stock[key] ?? 0) - (cart[key] ?? 0);

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
    const match = items.find(
      (s) => s.barcode?.toLowerCase() === code || s.sku.toLowerCase() === code,
    );
    if (match) {
      setQuantity(match.key, (cart[match.key] ?? 0) + 1);
      setSearch("");
      return;
    }
    // The product's own SKU on a product with options: ask which one.
    const parent = products.find(
      (p) => p.variants && p.sku.toLowerCase() === code,
    );
    if (parent) {
      setPicking(parent);
      setSearch("");
    }
  };

  const startCheckout = () => {
    setPaymentMethod(null);
    setCustomer(EMPTY_CUSTOMER);
    setExisting(null);
    setCheckedPhone(null);
    setCheckoutError(null);
    setStep("payment");
  };

  const customerValid =
    customer.name.trim() !== "" && customer.phone.trim() !== "";

  const completeSale = async (buyer: Customer = customer) => {
    if (!paymentMethod || !customerValid) return;
    setCharging(true);
    setCheckoutError(null);
    try {
      const phone = buyer.phone.replace(/\s+/g, "");
      if (phone !== checkedPhone) {
        setCheckedPhone(phone);
        const found = await apiFetch(
          `/customers/lookup?phone=${encodeURIComponent(phone)}`,
        );
        if (found.ok) {
          setExisting((await found.json()) as Customer);
          return;
        }
      }
      setExisting(null);
      const res = await apiFetch("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          customer: buyer,
          items: lines.map((l) => orderItem(l.item, l.quantity)),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Order failed");
      // Render the receipt now so the print dialog shows this sale.
      flushSync(() => setLastOrder(body as Order));
      if (AUTO_PRINT) await printPage();
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
    <div className="flex h-screen flex-col bg-surface-alt text-ink print:block print:h-auto print:bg-white">
      <header className="flex items-center print:hidden gap-4 bg-ink px-6 py-3 text-white">
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
          className="ml-auto w-72 rounded-md bg-zinc-800 px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand"
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
            <p className="text-muted">Loading products…</p>
          ) : visible.length === 0 ? (
            <p className="text-muted">No products found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => {
                const options = sellables(p);
                const inStock = options.reduce(
                  (sum, s) => sum + Math.max(0, left(s.key)),
                  0,
                );
                const prices = options.map((s) => s.price);
                const lowest = Math.min(...prices);
                return (
                  <button
                    key={p.id}
                    disabled={inStock <= 0}
                    onClick={() =>
                      p.variants
                        ? setPicking(p)
                        : setQuantity(p.id, (cart[p.id] ?? 0) + 1)
                    }
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
                      <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-md bg-surface-alt text-3xl font-semibold text-brand">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs text-muted">{p.sku}</span>
                    <span className="mt-1 font-medium">{p.name}</span>
                    {p.variants && (
                      <span className="mt-1 self-start rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                        {p.variants.length} options
                      </span>
                    )}
                    <span className="mt-4 text-lg font-semibold">
                      {lowest < Math.max(...prices) && (
                        <span className="text-sm font-normal text-muted">
                          From{" "}
                        </span>
                      )}
                      {money.format(lowest)}
                    </span>
                    <span className="text-xs text-muted">
                      {inStock > 0 ? `${inStock} in stock` : "Out of stock"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        <aside className="flex w-96 flex-col border-l border-line bg-white">
          <h2 className="border-b border-line px-5 py-4 font-semibold">
            Current sale
          </h2>
          <div className="flex-1 overflow-y-auto px-5">
            {lines.length === 0 ? (
              <div className="py-6">
                <p className="text-sm text-muted">
                  {lastOrder
                    ? `Sale complete — ${money.format(lastOrder.total)} paid by ${PAYMENT_LABELS[
                        lastOrder.paymentMethod
                      ].toLowerCase()} for ${lastOrder.customer.name}.`
                    : "Tap a product to add it to the sale."}
                </p>
                {lastOrder && (
                  <button
                    onClick={() => void printPage()}
                    className="mt-3 w-full rounded-lg border border-line-strong py-2 text-sm font-medium hover:bg-brand-soft"
                  >
                    Print receipt
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {lines.map(({ item, quantity }) => (
                  <li key={item.key} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.product.name}
                      </p>
                      {item.variant && (
                        <p className="truncate text-xs font-medium text-brand-deep">
                          {item.variant.name}
                        </p>
                      )}
                      <p className="text-xs text-muted">
                        {money.format(item.price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        aria-label={`Remove one ${item.name}`}
                        onClick={() => setQuantity(item.key, quantity - 1)}
                        className="h-8 w-8 rounded-md bg-surface-alt font-semibold hover:bg-brand-soft"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm">
                        {quantity}
                      </span>
                      <button
                        aria-label={`Add one ${item.name}`}
                        onClick={() => setQuantity(item.key, quantity + 1)}
                        className="h-8 w-8 rounded-md bg-surface-alt font-semibold hover:bg-brand-soft"
                      >
                        +
                      </button>
                    </div>
                    <span className="w-16 text-right text-sm font-medium">
                      {money.format(item.price * quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-line p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Total</span>
              <span className="text-2xl font-semibold">
                {money.format(total)}
              </span>
            </div>
            <button
              disabled={lines.length === 0 || charging}
              onClick={startCheckout}
              className="mt-4 w-full rounded-lg bg-brand py-3 font-semibold text-ink hover:bg-brand-hover disabled:opacity-40"
            >
              Charge
            </button>
            <button
              disabled={lines.length === 0 || charging}
              onClick={() => setCart({})}
              className="mt-2 w-full rounded-lg py-2 text-sm text-muted hover:bg-brand-soft disabled:opacity-40"
            >
              Clear sale
            </button>
          </div>
        </aside>
      </div>

      {picking && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/50 p-6 print:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPicking(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Choose ${picking.name}`}
            className="flex max-h-full w-full max-w-lg flex-col rounded-xl bg-white p-6 shadow-xl"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Choose an option
            </p>
            <h2 className="mt-1 text-xl font-semibold">{picking.name}</h2>
            <div className="mt-4 grid gap-2 overflow-y-auto sm:grid-cols-2">
              {sellables(picking).map((s) => {
                const remaining = left(s.key);
                return (
                  <button
                    key={s.key}
                    disabled={remaining <= 0}
                    onClick={() => {
                      setQuantity(s.key, (cart[s.key] ?? 0) + 1);
                      setPicking(null);
                    }}
                    className="flex flex-col rounded-lg border-2 border-line p-3 text-left hover:border-brand hover:bg-brand-soft disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-transparent"
                  >
                    <span className="font-medium">{s.variant?.name}</span>
                    <span className="text-xs text-muted">{s.sku}</span>
                    <span className="mt-2 font-semibold">
                      {money.format(s.price)}
                    </span>
                    <span className="text-xs text-muted">
                      {remaining > 0 ? `${remaining} in stock` : "Out of stock"}
                      {cart[s.key] ? ` · ${cart[s.key]} in sale` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setPicking(null)}
              className="mt-4 w-full rounded-lg py-2 text-sm text-muted hover:bg-brand-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-6 print:hidden">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
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
                      className={`rounded-lg border-2 py-8 text-lg font-semibold hover:border-brand hover:bg-brand-soft ${
                        paymentMethod === m
                          ? "border-brand bg-brand-soft"
                          : "border-line"
                      }`}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep(null)}
                  className="mt-4 w-full rounded-lg py-2 text-sm text-muted hover:bg-brand-soft"
                >
                  Cancel
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!existing) void completeSale();
                }}
              >
                <h2 className="mt-1 text-xl font-semibold">Customer details</h2>
                <p className="text-sm text-muted">
                  Paying by{" "}
                  {paymentMethod && PAYMENT_LABELS[paymentMethod].toLowerCase()}
                </p>
                <label className="mt-4 block text-sm font-medium">
                  Full name
                  <input
                    id="customer-name"
                    autoFocus
                    required
                    value={customer.name}
                    onChange={(e) =>
                      setCustomer({ ...customer, name: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-line-strong px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-brand"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium">
                  Phone number
                  <input
                    required
                    type="tel"
                    value={customer.phone}
                    onChange={(e) => {
                      setCustomer({ ...customer, phone: e.target.value });
                      setExisting(null);
                    }}
                    className="mt-1 w-full rounded-md border border-line-strong px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-brand"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium">
                  Email{" "}
                  <span className="font-normal text-muted">(optional)</span>
                  <input
                    type="email"
                    value={customer.email ?? ""}
                    onChange={(e) =>
                      setCustomer({ ...customer, email: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-line-strong px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-brand"
                  />
                </label>
                {existing && (
                  <div className="mt-4 rounded-lg border border-brand bg-brand-soft p-4 text-sm">
                    <p className="font-semibold">
                      This customer already exists
                    </p>
                    <p className="mt-1">
                      {existing.name} · {existing.phone}
                      {existing.email && ` · ${existing.email}`}
                    </p>
                    <p className="mt-2">Is this the same person?</p>
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        disabled={charging}
                        onClick={() => {
                          setCustomer(existing);
                          void completeSale(existing);
                        }}
                        className="flex-1 rounded-lg bg-brand py-2 font-semibold text-ink hover:bg-brand-hover disabled:opacity-40"
                      >
                        Yes, continue
                      </button>
                      <button
                        type="button"
                        disabled={charging}
                        onClick={() => {
                          // Start again with an empty form for the new person.
                          setExisting(null);
                          setCheckedPhone(null);
                          setCustomer(EMPTY_CUSTOMER);
                          document.getElementById("customer-name")?.focus();
                        }}
                        className="flex-1 rounded-lg bg-white py-2 font-medium hover:bg-surface-alt disabled:opacity-40"
                      >
                        No, new customer
                      </button>
                    </div>
                  </div>
                )}
                {checkoutError && (
                  <p className="mt-3 text-sm text-red-700">{checkoutError}</p>
                )}
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    disabled={charging}
                    onClick={() => setStep("payment")}
                    className="flex-1 rounded-lg bg-surface-alt py-3 font-medium hover:bg-brand-soft disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={!customerValid || charging || !!existing}
                    className="flex-1 rounded-lg bg-brand py-3 font-semibold text-ink hover:bg-brand-hover disabled:opacity-40"
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
