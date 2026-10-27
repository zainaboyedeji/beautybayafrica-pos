"use client";

import AddCustomerForm from "./add-customer-form";
import AddProductForm from "./add-product-form";
import Icon from "./icons";
import Modal from "./modal";
import RecordSaleForm from "./record-sale-form";

export type ActionModal = "product" | "sale" | "customer";

type Props = {
  open: ActionModal | null;
  onClose: () => void;
  /** Called after a successful save, with a message to show on the page. */
  onSaved: (message: string) => void;
};

/** The add-product / record-sale / add-customer pop-ups used across the back office. */
export default function ActionModals({ open, onClose, onSaved }: Props) {
  if (open === "product")
    return (
      <Modal title="Add a product" onClose={onClose} wide>
        <AddProductForm onSaved={onSaved} onCancel={onClose} />
      </Modal>
    );
  if (open === "customer")
    return (
      <Modal title="Add a customer" onClose={onClose}>
        <AddCustomerForm onSaved={onSaved} onCancel={onClose} />
      </Modal>
    );
  if (open === "sale")
    return (
      <Modal title="Record a sale" onClose={onClose} wide>
        <RecordSaleForm onSaved={onSaved} onCancel={onClose} />
      </Modal>
    );
  return null;
}

export function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p
      role="status"
      className="mt-5 flex animate-pop-in items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-100"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
      {text}
    </p>
  );
}
