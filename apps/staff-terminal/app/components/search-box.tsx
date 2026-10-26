import { INPUT } from "./form-styles";

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
    <div className="max-w-sm">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={INPUT}
      />
    </div>
  );
}

export function NoMatches() {
  return <p className="text-sm text-muted">Nothing matches your search.</p>;
}
