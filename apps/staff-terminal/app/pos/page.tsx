"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer, Order, PaymentMethod, Product } from "@pos/types";
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
import { getSession } from "../lib/auth";
import { printPage } from "../lib/print";
import { INPUT, PRIMARY_BUTTON } from "../components/form-styles";
import Icon from "../components/icons";
import TopBar from "../components/top-bar";

// Pop-ups over the till: a soft veil and a white card that pops in.
const OVERLAY =
  "fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6 backdrop-blur-sm print:hidden";
const DIALOG = "w-full animate-pop-in rounded-2xl bg-white p-6 shadow-2xl";
const QUIET_BUTTON =
  "w-full rounded-xl py-2 text-sm font-medium text-muted transition hover:bg-brand-soft/60 hover:text-ink disabled:opacity-40";

// Set NEXT_PUBLIC_AUTO_PRINT_RECEIPT=false to print only when asked.
const AUTO_PRINT = process.env.NEXT_PUBLIC_AUTO_PRINT_RECEIPT !== "false";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  transfer: "Bank transfer",
  card: "Card",
};

const EMPTY_CUSTOMER: Customer = { name: "", phone: "", email: "" };

type CheckoutStep = "payment" | "customer";

export default function Till() {
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
  // staff member to say whether it's the same person.
  const [existing, setExisting] = useState<Customer | null>(null);
  // The phone number already checked, so they are asked only once.
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
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

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
    <div className="flex h-screen flex-col gap-3 p-3 text-ink print:block print:h-auto print:bg-white print:p-0">
      <TopBar
        title="The till"
        name={session?.name}
        links={[
          ...(session?.role === "admin"
            ? [{ href: "/", label: "Back office", icon: "arrowLeft" as const }]
            : []),
          { href: "/request", label: "Requests", icon: "requests" },
        ]}
      >
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted/80">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addScanned();
            }}
            placeholder="Scan barcode or search by name or SKU"
            className="w-80 rounded-xl bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-muted focus:ring-4 focus:ring-white/50"
          />
        </div>
      </TopBar>

      {error && (
        <div className="flex items-center justify-between rounded-xl bg-red-50 px-5 py-2.5 text-sm text-red-800 ring-1 ring-red-100 print:hidden">
          <span>{error}</span>
          <button onClick={() => void load()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 print:hidden">
        <main className="flex-1 overflow-y-auto p-3">
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
                    className="group flex flex-col rounded-2xl bg-white p-3 text-left shadow-soft ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-brand/40 active:scale-[0.98] disabled:translate-y-0 disabled:opacity-40"
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="mb-3 aspect-square w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-xl bg-gradient-to-br from-brand-soft via-surface-alt to-violet-100 font-display text-4xl font-semibold text-brand-deep transition group-hover:from-brand/30">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {p.sku}
                    </span>
                    <span className="mt-0.5 px-1 font-medium leading-snug">
                      {p.name}
                    </span>
                    {p.variants && (
                      <span className="ml-1 mt-1.5 self-start rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                        {p.variants.length} options
                      </span>
                    )}
                    <span className="mt-auto px-1 pt-3 text-lg font-semibold">
                      {lowest < Math.max(...prices) && (
                        <span className="text-sm font-normal text-muted">
                          From{" "}
                        </span>
                      )}
                      {money.format(lowest)}
                    </span>
                    <span
                      className={`px-1 text-xs ${
                        inStock <= 0
                          ? "font-medium text-red-700"
                          : inStock <= 5
                            ? "font-medium text-amber-700"
                            : "text-muted"
                      }`}
                    >
                      {inStock > 0 ? `${inStock} in stock` : "Out of stock"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        <aside className="flex w-96 flex-col overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-line">
          <div className="flex items-center justify-between border-b border-line bg-gradient-to-r from-surface-alt to-brand-soft/50 px-5 py-4">
            <h2 className="text-xl font-semibold">Current sale</h2>
            {lines.length > 0 && (
              <span className="rounded-full bg-gradient-to-r from-brand to-brand-hover px-2.5 py-0.5 text-xs font-semibold text-ink">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-5">
            {lines.length === 0 ? (
              <div className="py-8 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-soft to-violet-100 text-brand-deep">
                  <Icon name={lastOrder ? "check" : "sell"} className="h-6 w-6" />
                </span>
                <p className="mt-3 text-sm text-muted">
                  {lastOrder
                    ? `Sale complete — ${money.format(lastOrder.total)} paid by ${PAYMENT_LABELS[
                        lastOrder.paymentMethod
                      ].toLowerCase()} for ${lastOrder.customer.name}.`
                    : "Tap a product to add it to the sale."}
                </p>
                {lastOrder && (
                  <button
                    onClick={() => void printPage()}
                    className="mt-4 w-full rounded-xl border border-line-strong py-2 text-sm font-medium transition hover:bg-brand-soft/50"
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
                        className="h-8 w-8 rounded-lg bg-surface-alt font-semibold ring-1 ring-line transition hover:bg-brand-soft hover:ring-brand/40"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm">
                        {quantity}
                      </span>
                      <button
                        aria-label={`Add one ${item.name}`}
                        onClick={() => setQuantity(item.key, quantity + 1)}
                        className="h-8 w-8 rounded-lg bg-surface-alt font-semibold ring-1 ring-line transition hover:bg-brand-soft hover:ring-brand/40"
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
          <div className="border-t border-line bg-surface-alt/60 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Total
              </span>
              <span className="text-3xl font-semibold tabular-nums">
                {money.format(total)}
              </span>
            </div>
            <button
              disabled={lines.length === 0 || charging}
              onClick={startCheckout}
              className={`${PRIMARY_BUTTON} mt-4 w-full py-3.5 text-base`}
            >
              Charge {lines.length > 0 && money.format(total)}
            </button>
            <button
              disabled={lines.length === 0 || charging}
              onClick={() => setCart({})}
              className={`${QUIET_BUTTON} mt-2`}
            >
              Clear sale
            </button>
          </div>
        </aside>
      </div>

      {picking && (
        <div
          className={OVERLAY}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPicking(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Choose ${picking.name}`}
            className={`${DIALOG} flex max-h-full max-w-lg flex-col`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-deep">
              Choose an option
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{picking.name}</h2>
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
                    className="flex flex-col rounded-xl border-2 border-line p-3 text-left transition hover:border-brand hover:bg-brand-soft/50 disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-transparent"
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
              className={`${QUIET_BUTTON} mt-4`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step && (
        <div className={OVERLAY}>
          <div
            role="dialog"
            aria-modal="true"
            className={`${DIALOG} max-w-md`}
          >
            <div className="flex items-center gap-2">
              {(["payment", "customer"] as const).map((s) => (
                <span
                  key={s}
                  aria-hidden
                  className={`h-1.5 flex-1 rounded-full ${
                    s === step || s === "payment"
                      ? "bg-gradient-to-r from-brand to-brand-hover"
                      : "bg-line"
                  }`}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-deep">
              Step {step === "payment" ? 1 : 2} of 2 · {money.format(total)}
            </p>

            {step === "payment" ? (
              <>
                <h2 className="mt-1 text-2xl font-semibold">
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
                      className={`rounded-2xl border-2 py-8 text-lg font-semibold transition hover:-translate-y-0.5 hover:border-brand hover:bg-brand-soft/50 ${
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
                  className={`${QUIET_BUTTON} mt-4`}
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
                <h2 className="mt-1 text-2xl font-semibold">Customer details</h2>
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
                    className={INPUT}
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
                    className={INPUT}
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
                    className={INPUT}
                  />
                </label>
                {existing && (
                  <div className="mt-4 rounded-xl border border-brand/40 bg-brand-soft/60 p-4 text-sm">
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
                        className={`${PRIMARY_BUTTON} flex-1`}
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
                        className="flex-1 rounded-xl bg-white py-2 font-medium ring-1 ring-line-strong transition hover:bg-surface-alt disabled:opacity-40"
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
                    className="flex-1 rounded-xl bg-surface-alt py-3 font-medium ring-1 ring-line transition hover:bg-brand-soft/60 disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={!customerValid || charging || !!existing}
                    className={`${PRIMARY_BUTTON} flex-1 py-3`}
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
