"use client";

import { useState } from "react";
import type { Product } from "@pos/types";
import {
  apiFetch,
  categoryList,
  describeError,
  fetchCatalog,
  fetchSuppliers,
  useLoad,
} from "../lib/api";
import { INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./form-styles";

const EMPTY_FORM = {
  sku: "",
  barcode: "",
  name: "",
  category: "",
  costPrice: "",
  price: "",
  quantity: "",
  imageUrl: "",
  supplierId: "",
};

// Chosen in the supplier list to type in a supplier that isn't saved yet.
const NEW_SUPPLIER = "__new__";

const FIELDS = [
  { key: "sku", label: "SKU", type: "text", required: true },
  { key: "barcode", label: "Barcode", type: "text", required: false },
  { key: "name", label: "Name", type: "text", required: true },
  { key: "category", label: "Category", type: "text", required: false },
  { key: "costPrice", label: "Cost price", type: "number", required: false },
  { key: "price", label: "Selling price", type: "number", required: true },
  { key: "quantity", label: "Quantity", type: "number", required: true },
  {
    key: "imageUrl",
    label: "Cloudinary image link",
    type: "url",
    required: false,
  },
] as const;

// With options, these belong to each option instead of the product.
const PER_OPTION_FIELDS = new Set([
  "barcode",
  "costPrice",
  "price",
  "quantity",
]);

type OptionForm = {
  /** Set for options that already exist, so their sales history lines up. */
  id?: string;
  /** The online shop sets this option's selling price. */
  fromWebsite?: boolean;
  name: string;
  sku: string;
  barcode: string;
  costPrice: string;
  price: string;
  quantity: string;
};

const OPTION_FIELDS = [
  { key: "name", label: "Option", type: "text", required: true, wide: true },
  { key: "sku", label: "SKU", type: "text", required: true },
  { key: "barcode", label: "Barcode", type: "text", required: false },
  { key: "costPrice", label: "Cost price", type: "number", required: false },
  { key: "price", label: "Selling price", type: "number", required: true },
  { key: "quantity", label: "Quantity", type: "number", required: true },
] as const;

const LOCKED_INPUT = `${INPUT} disabled:bg-surface-alt disabled:text-muted`;

const WebsitePriceNote = () => (
  <span className="font-normal text-muted"> (set on the website)</span>
);

// Scanners press Enter after the code; move on instead of submitting.
const nextFieldOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const inputs = [
    ...(e.currentTarget.form?.querySelectorAll<HTMLInputElement>("input") ??
      []),
  ];
  inputs[inputs.indexOf(e.currentTarget) + 1]?.focus();
};

type Props = {
  onSaved: (message: string) => void;
  onCancel: () => void;
  /** When given, the form edits this product instead of adding a new one. */
  product?: Product;
  /** Current stock by product or option id. */
  stock?: Record<string, number>;
};

export default function AddProductForm({
  onSaved,
  onCancel,
  product,
  stock = {},
}: Props) {
  // Categories already in use, suggested in the category box.
  const catalog = useLoad(fetchCatalog);
  const categories = categoryList(catalog.data?.products ?? []);
  const [form, setForm] = useState(
    product
      ? {
          sku: product.sku,
          barcode: product.barcode ?? "",
          name: product.name,
          category: product.category ?? "",
          costPrice: product.costPrice?.toString() ?? "",
          price: product.price.toString(),
          quantity: (stock[product.id] ?? 0).toString(),
          imageUrl: product.imageUrl ?? "",
          supplierId: product.supplierId ?? "",
        }
      : EMPTY_FORM,
  );
  const suppliers = useLoad(fetchSuppliers);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [options, setOptions] = useState<OptionForm[]>(
    (product?.variants ?? []).map((v) => ({
      id: v.id,
      fromWebsite: v.fromWebsite,
      name: v.name,
      sku: v.sku,
      barcode: v.barcode ?? "",
      costPrice: v.costPrice?.toString() ?? "",
      price: v.price.toString(),
      quantity: (stock[v.id] ?? 0).toString(),
    })),
  );
  const hasOptions = options.length > 0;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newOption = (n: number): OptionForm => ({
    name: "",
    sku: form.sku.trim() ? `${form.sku.trim()}-${n}` : "",
    barcode: "",
    costPrice: form.costPrice,
    price: form.price,
    quantity: "",
  });

  const toggleOptions = (on: boolean) => {
    if (!on) {
      setOptions([]);
      return;
    }
    // Start from the product's own details, so they aren't retyped.
    setOptions([
      {
        ...newOption(1),
        barcode: form.barcode,
        quantity: form.quantity,
      },
    ]);
  };

  const updateOption = (index: number, change: Partial<OptionForm>) =>
    setOptions(options.map((o, i) => (i === index ? { ...o, ...change } : o)));

  // Saves the supplier typed into the form, and selects it so a retry
  // doesn't add it twice.
  const saveNewSupplier = async () => {
    const res = await apiFetch("/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSupplier.name.trim(),
        phone: newSupplier.phone.trim(),
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Could not save the supplier");
    await suppliers.reload();
    setForm((current) => ({ ...current, supplierId: body.id }));
    return body.id as string;
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const supplierId =
        form.supplierId === NEW_SUPPLIER
          ? await saveNewSupplier()
          : form.supplierId;
      const res = await apiFetch(
        product ? `/products/${product.id}` : "/products",
        {
          method: product ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: form.sku,
            name: form.name,
            category: form.category.trim(),
            ...(supplierId ? { supplierId } : {}),
            ...(form.imageUrl.trim() !== ""
              ? { imageUrl: form.imageUrl.trim() }
              : {}),
            ...(hasOptions
              ? {
                  variants: options.map((o) => ({
                    ...(o.id ? { id: o.id } : {}),
                    name: o.name,
                    sku: o.sku,
                    price: Number(o.price),
                    quantity: Number(o.quantity),
                    ...(o.barcode.trim() !== ""
                      ? { barcode: o.barcode.trim() }
                      : {}),
                    ...(o.costPrice !== ""
                      ? { costPrice: Number(o.costPrice) }
                      : {}),
                  })),
                }
              : {
                  price: Number(form.price),
                  quantity: Number(form.quantity),
                  ...(form.barcode.trim() !== ""
                    ? { barcode: form.barcode.trim() }
                    : {}),
                  ...(form.costPrice !== ""
                    ? { costPrice: Number(form.costPrice) }
                    : {}),
                }),
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save product");
      onSaved(`${body.name} ${product ? "updated" : "added"}.`);
    } catch (e) {
      setError(describeError(e, "Could not save product"));
      setSaving(false);
    }
  };

  return (
    <form
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <datalist id="product-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {FIELDS.filter((f) => !(hasOptions && PER_OPTION_FIELDS.has(f.key))).map(
        (field, index) => (
          <label
            key={field.key}
            className={`text-sm font-medium ${
              field.key === "name" ||
              field.key === "category" ||
              field.key === "sku" ||
              field.key === "barcode"
                ? "col-span-2"
                : ""
            } ${field.key === "quantity" || field.key === "imageUrl" ? "col-span-2" : ""}`}
          >
            {field.label}
            {!field.required && (
              <span className="font-normal text-muted"> (optional)</span>
            )}
            {field.key === "price" && product?.fromWebsite && (
              <WebsitePriceNote />
            )}
            <input
              autoFocus={index === 0}
              disabled={field.key === "price" && product?.fromWebsite}
              type={field.type}
              required={field.required}
              min={field.type === "number" ? 0 : undefined}
              step={
                field.key === "quantity"
                  ? 1
                  : field.type === "number"
                    ? "any"
                    : undefined
              }
              placeholder={
                field.key === "imageUrl"
                  ? "https://res.cloudinary.com/…"
                  : field.key === "barcode"
                    ? "Scan or type the barcode"
                    : field.key === "category"
                      ? "e.g. Skincare"
                      : undefined
              }
              list={field.key === "category" ? "product-categories" : undefined}
              onKeyDown={field.key === "barcode" ? nextFieldOnEnter : undefined}
              name={field.key}
              value={form[field.key]}
              onChange={(e) =>
                setForm({ ...form, [field.key]: e.target.value })
              }
              className={LOCKED_INPUT}
            />
          </label>
        ),
      )}
      {form.imageUrl.trim().startsWith("https://res.cloudinary.com/") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={form.imageUrl.trim()}
          alt="Product image preview"
          className="col-span-2 h-32 w-32 rounded-xl border border-line object-cover"
        />
      )}

      <label className="col-span-2 text-sm font-medium">
        Supplier <span className="font-normal text-muted">(optional)</span>
        <select
          value={form.supplierId}
          onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
          className={INPUT}
        >
          <option value="">None</option>
          {/* A removed supplier, or one still loading. */}
          {product?.supplierId &&
            !suppliers.data?.some((s) => s.id === product.supplierId) && (
              <option value={product.supplierId}>
                {product.supplierName ?? "Current supplier"}
              </option>
            )}
          {(suppliers.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW_SUPPLIER}>+ Add a new supplier…</option>
        </select>
      </label>
      {form.supplierId === NEW_SUPPLIER && (
        <div className="col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface-alt/50 p-3">
          <label className="text-sm font-medium">
            Supplier name
            <input
              required
              autoFocus
              value={newSupplier.name}
              onChange={(e) =>
                setNewSupplier({ ...newSupplier, name: e.target.value })
              }
              className={INPUT}
            />
          </label>
          <label className="text-sm font-medium">
            Phone <span className="font-normal text-muted">(optional)</span>
            <input
              type="tel"
              value={newSupplier.phone}
              onChange={(e) =>
                setNewSupplier({ ...newSupplier, phone: e.target.value })
              }
              className={INPUT}
            />
          </label>
          <p className="col-span-2 text-xs text-muted">
            Saved to Suppliers with this product. Add their other details
            there.
          </p>
        </div>
      )}

      <label className="col-span-2 mt-1 flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={hasOptions}
          onChange={(e) => toggleOptions(e.target.checked)}
          className="h-4 w-4 accent-brand-deep"
        />
        Comes in options, such as shades or sizes
      </label>

      {hasOptions && (
        <div className="col-span-2 space-y-3">
          <p className="text-sm text-muted">
            Each option has its own SKU, price and stock. The till asks which
            option the customer wants.
          </p>
          {options.map((option, index) => (
            <fieldset
              key={option.id ?? `new-${index}`}
              className="grid grid-cols-4 gap-3 rounded-xl border border-line p-3"
            >
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Option {index + 1}
              </legend>
              {OPTION_FIELDS.map((field) => (
                <label
                  key={field.key}
                  className={`text-sm font-medium ${"wide" in field ? "col-span-2" : ""}`}
                >
                  {field.label}
                  {!field.required && (
                    <span className="font-normal text-muted"> (optional)</span>
                  )}
                  {field.key === "price" && option.fromWebsite && (
                    <WebsitePriceNote />
                  )}
                  <input
                    type={field.type}
                    disabled={field.key === "price" && option.fromWebsite}
                    required={field.required}
                    min={field.type === "number" ? 0 : undefined}
                    step={
                      field.key === "quantity"
                        ? 1
                        : field.type === "number"
                          ? "any"
                          : undefined
                    }
                    placeholder={
                      field.key === "name" ? "e.g. Ruby Red or 50ml" : undefined
                    }
                    onKeyDown={
                      field.key === "barcode" ? nextFieldOnEnter : undefined
                    }
                    value={option[field.key]}
                    onChange={(e) =>
                      updateOption(index, { [field.key]: e.target.value })
                    }
                    className={LOCKED_INPUT}
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() =>
                  setOptions(options.filter((_, i) => i !== index))
                }
                className="self-end rounded-md py-2 text-sm text-muted hover:bg-brand-soft"
              >
                Remove
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setOptions([...options, newOption(options.length + 1)])
            }
            className="text-sm font-medium text-brand-deep underline"
          >
            + Add another option
          </button>
        </div>
      )}

      {error && <p className="col-span-2 text-sm text-red-700">{error}</p>}
      <div className="col-span-2 mt-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : product ? "Save changes" : "Add product"}
        </button>
      </div>
    </form>
  );
}
