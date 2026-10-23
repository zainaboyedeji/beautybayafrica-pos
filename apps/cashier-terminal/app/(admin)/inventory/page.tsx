"use client";

import { useState } from "react";
import type { Product } from "@pos/types";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../../components/action-modals";
import AddProductForm from "../../components/add-product-form";
import Modal from "../../components/modal";
import { PRIMARY_BUTTON } from "../../components/form-styles";
import {
  apiFetch,
  describeError,
  fetchCatalog,
  money,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";

type ImportResult = {
  added: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const TEMPLATE =
  "sku,barcode,name,cost_price,price,quantity,image_url\nBEV-001,5012345678900,Bottled Water 75cl,500,800,40,https://res.cloudinary.com/your-cloud/image/upload/water.jpg\nSNK-001,,Potato Chips,900,1500,25,\n";

export default function InventoryPage() {
  const catalog = useLoad(fetchCatalog);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setResult(null);
    setUploadError(null);
    try {
      const res = await apiFetch("/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: await file.text(),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.errors)
          setResult({
            added: 0,
            updated: 0,
            skipped: body.errors.length,
            errors: body.errors,
          });
        throw new Error(body.error ?? "Import failed");
      }
      setResult(body as ImportResult);
      await catalog.reload();
    } catch (e) {
      setUploadError(describeError(e, "Import failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Inventory</h1>
        <button onClick={() => setModal("product")} className={PRIMARY_BUTTON}>
          Add product
        </button>
      </div>
      <Notice text={notice} />
      <ActionModals
        open={modal}
        onClose={() => setModal(null)}
        onSaved={(message) => {
          setModal(null);
          setNotice(message);
          void catalog.reload();
        }}
      />
      {editing && (
        <Modal title="Edit product" onClose={() => setEditing(null)}>
          <AddProductForm
            product={editing}
            quantity={catalog.data?.stock[editing.id] ?? 0}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              setNotice(message);
              void catalog.reload();
            }}
          />
        </Modal>
      )}

      <div className="mt-6">
        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Upload many products</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Upload a CSV file with the columns{" "}
            <code className="rounded bg-zinc-100 px-1">sku</code>,{" "}
            <code className="rounded bg-zinc-100 px-1">name</code>,{" "}
            <code className="rounded bg-zinc-100 px-1">price</code> and{" "}
            <code className="rounded bg-zinc-100 px-1">quantity</code>, plus an
            optional{" "}
            <code className="rounded bg-zinc-100 px-1">barcode</code>,{" "}
            <code className="rounded bg-zinc-100 px-1">cost_price</code> and{" "}
            <code className="rounded bg-zinc-100 px-1">image_url</code>{" "}
            (Cloudinary link).
            Products are matched by SKU: existing ones are updated, new ones
            are added.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              {uploading ? "Uploading…" : "Choose CSV file"}
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={uploading}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </label>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
              download="inventory-template.csv"
              className="text-sm font-medium text-emerald-700 underline"
            >
              Download template
            </a>
          </div>
          {uploadError && (
            <p className="mt-3 text-sm text-red-700">{uploadError}</p>
          )}
          {result && (
            <div className="mt-3 text-sm">
              {(result.added > 0 || result.updated > 0) && (
                <p className="text-emerald-700">
                  {result.added} added, {result.updated} updated
                  {result.skipped > 0 && `, ${result.skipped} skipped`}.
                </p>
              )}
              {result.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-red-700">
                  {result.errors.slice(0, 20).map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                  {result.errors.length > 20 && (
                    <li>…and {result.errors.length - 20} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="mt-6">
        {catalog.failed ? (
          <LoadError />
        ) : !catalog.data ? (
          <Loading />
        ) : (
          <table className="w-full overflow-hidden rounded-lg bg-white text-left text-sm shadow-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Barcode</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Cost price</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3 text-right">In stock</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {catalog.data.products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-zinc-100" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{p.sku}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {p.barcode ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-right">
                    {p.costPrice !== undefined
                      ? money.format(p.costPrice)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {money.format(p.price)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.costPrice !== undefined && p.price > 0
                      ? `${Math.round(((p.price - p.costPrice) / p.price) * 100)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {catalog.data?.stock[p.id] ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing(p)}
                      className="font-medium text-emerald-700 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
