"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

export default function Modal({ title, onClose, children, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Rendered on <body>: the page's fade-in animation uses a transform, which
  // would otherwise pin this "fixed" overlay to the page area and crop it.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-full w-full animate-pop-in overflow-auto rounded-2xl bg-white text-ink shadow-2xl ring-1 ring-line ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
      >
        {/* A soft pink header band. */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-gradient-to-r from-surface-alt to-brand-soft/50 px-4 py-4 sm:px-6">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-muted transition hover:bg-white hover:text-brand-deep"
          >
            ×
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
