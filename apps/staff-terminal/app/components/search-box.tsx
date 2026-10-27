import { INPUT } from "./form-styles";
import Icon from "./icons";

/** True when any of the fields contains the search text (case-insensitive). */
export const matches = (
  search: string,
  ...fields: (string | number | null | undefined)[]
) => {
  const q = search.trim().toLowerCase();
  return (
    !q || fields.some((f) => f != null && String(f).toLowerCase().includes(q))
  );
};

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
