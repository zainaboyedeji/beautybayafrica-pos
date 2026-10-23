"use client";

import { useState } from "react";
import { API_URL, describeError } from "../lib/api";
import { INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./form-styles";

const EMPTY_FORM = {
  sku: "",
  barcode: "",
  name: "",
  costPrice: "",
  price: "",
  quantity: "",
  imageUrl: "",
};

const FIELDS = [
  { key: "sku", label: "SKU", type: "text", required: true },
  { key: "barcode", label: "Barcode", type: "text", required: false },
  { key: "name", label: "Name", type: "text", required: true },
  { key: "costPrice", label: "Cost price", type: "number", required: false },
  { key: "price", label: "Selling price", type: "number", required: true },
  { key: "quantity", label: "Quantity", type: "number", required: true },
  { key: "imageUrl", label: "Cloudinary image link", type: "url", required: false },
] as const;

type Props = { onSaved: (message: string) => void; onCancel: () => void };

export default function AddProductForm({ onSaved, onCancel }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: form.sku,
          name: form.name,
          price: Number(form.price),
          quantity: Number(form.quantity),
          ...(form.barcode.trim() !== ""
            ? { barcode: form.barcode.trim() }
            : {}),
          ...(form.costPrice !== ""
            ? { costPrice: Number(form.costPrice) }
            : {}),
          ...(form.imageUrl.trim() !== ""
            ? { imageUrl: form.imageUrl.trim() }
            : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add product");
      onSaved(`${body.name} added.`);
    } catch (e) {
      setError(describeError(e, "Could not add product"));
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
      {FIELDS.map((field, index) => (
        <label
          key={field.key}
          className={`text-sm font-medium ${
            field.key === "name" ||
            field.key === "sku" ||
            field.key === "barcode"
              ? "col-span-2"
              : ""
          } ${field.key === "quantity" || field.key === "imageUrl" ? "col-span-2" : ""}`}
        >
          {field.label}
          {!field.required && (
            <span className="font-normal text-zinc-500"> (optional)</span>
          )}
          <input
            autoFocus={index === 0}
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
                  : undefined
            }
            onKeyDown={
              // Scanners press Enter after the code; don't submit the form.
              field.key === "barcode"
                ? (e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    e.currentTarget.form
                      ?.querySelector<HTMLInputElement>("input[name=name]")
                      ?.focus();
                  }
                : undefined
            }
            name={field.key}
            value={form[field.key]}
            onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
            className={INPUT}
          />
        </label>
      ))}
      {form.imageUrl.trim().startsWith("https://res.cloudinary.com/") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={form.imageUrl.trim()}
          alt="Product image preview"
          className="col-span-2 h-32 w-32 rounded-lg border border-zinc-200 object-cover"
        />
      )}
      {error && <p className="col-span-2 text-sm text-red-700">{error}</p>}
      <div className="col-span-2 mt-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : "Add product"}
        </button>
      </div>
    </form>
  );
}
