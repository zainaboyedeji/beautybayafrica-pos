"use client";

import AddCustomerForm from "./add-customer-form";
import AddProductForm from "./add-product-form";
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
      <Modal title="Add a product" onClose={onClose}>
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
      className="mt-4 rounded-lg bg-emerald-100 px-4 py-3 text-sm text-emerald-800"
    >
      {text}
    </p>
  );
}
