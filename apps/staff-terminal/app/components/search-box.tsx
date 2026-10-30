import type { Product } from "@pos/types";
import { INPUT } from "./form-styles";
import Icon from "./icons";

/**
 * True when every word of the search text is found in one of the fields
 * (case-insensitive), so "arofac serum" finds an Arofac serum.
 */
export const matches = (
  search: string,
  ...fields: (string | number | null | undefined)[]
) => {
  const text = fields
    .filter((f) => f != null)
    .join("\n")
    .toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
};

/**
 * Whether a product matches a search, by its name, SKU, barcode, category
 * or supplier, or by one of its options. The till and Inventory both use it,
 * so they always find the same products.
 */
export const productMatches = (search: string, p: Product) =>
  matches(search, p.name, p.sku, p.barcode, p.category, p.supplierName) ||
  (p.variants ?? []).some((v) =>
    matches(
      search,
      p.name,
      v.name,
      v.sku,
      v.barcode,
      p.category,
      p.supplierName,
    ),
  );

export default function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative max-w-sm">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 mt-1 flex items-center text-muted">
        <Icon name="search" className="h-4 w-4" />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${INPUT} pl-10`}
      />
    </div>
  );
}

export function NoMatches() {
  return (
    <p className="rounded-2xl border border-dashed border-line-strong bg-white/60 px-5 py-8 text-center text-sm text-muted">
      Nothing matches your search.
    </p>
  );
}
