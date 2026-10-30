import type { Order, PaymentMethod } from "@pos/types";
import { money } from "../lib/api";

export const SHOP_NAME =
  process.env.NEXT_PUBLIC_SHOP_NAME ?? "Beauty Bay Africa";
export const SHOP_ADDRESS =
  process.env.NEXT_PUBLIC_SHOP_ADDRESS ??
  "112 Herbert Macaulay Way, Ebute Metta East, Lagos, Nigeria";
export const SHOP_PHONE = process.env.NEXT_PUBLIC_SHOP_PHONE ?? "0816 259 8682";
export const SHOP_WEBSITE =
  process.env.NEXT_PUBLIC_SHOP_WEBSITE ?? "beautybayafrica.com";
export const SHOP_INSTAGRAM =
  process.env.NEXT_PUBLIC_SHOP_INSTAGRAM ?? "@beautybayafrica";
export const SHOP_WHATSAPP =
  process.env.NEXT_PUBLIC_SHOP_WHATSAPP ?? "+234 816 259 8682";
// Optional footer line, e.g. a returns policy.
export const RECEIPT_NOTE = process.env.NEXT_PUBLIC_RECEIPT_NOTE;

// Printable width for each paper roll; thermal printers leave a margin.
const PAPER_WIDTHS: Record<string, string> = { "58": "48mm", "80": "72mm" };
const PAPER_WIDTH =
  PAPER_WIDTHS[process.env.NEXT_PUBLIC_RECEIPT_PAPER ?? "80"] ?? "72mm";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  transfer: "Bank transfer",
  card: "Card",
};

/** A dashed rule with the logo's four-point star in the middle. */
function Divider() {
  return (
    <div className="my-2 flex items-center gap-2">
      <span className="flex-1 border-t border-dashed border-black" />
      <span className="text-[10px]">✦</span>
      <span className="flex-1 border-t border-dashed border-black" />
    </div>
  );
}

type Props = {
  order: Order;
  productNames: Record<string, string>;
  /** Printed again later, e.g. from the Sales page. */
  copy?: boolean;
};

/** Hidden on screen; it is the only thing on the page when printing. */
export default function Receipt({ order, productNames, copy }: Props) {
  const createdAt = new Date(order.createdAt);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      data-receipt
      className="hidden bg-white font-mono text-[11px] leading-snug text-black print:block"
      style={{ width: PAPER_WIDTH }}
    >
      <style>{`@page { margin: 0; } @media print { html, body { background: #fff; } }`}</style>
      <div className="px-1 py-3">
        <div className="text-center">
          <p className="font-display text-lg font-bold tracking-wide">
            {SHOP_NAME}
          </p>
          {SHOP_ADDRESS && <p>{SHOP_ADDRESS}</p>}
          {SHOP_PHONE && <p>Tel: {SHOP_PHONE}</p>}
          <p>{SHOP_WEBSITE}</p>
        </div>

        <Divider />

        <p className="text-center text-xs font-bold tracking-[0.3em]">
          SALES RECEIPT
        </p>
        {copy && <p className="text-center text-[10px] font-bold">COPY</p>}
        {order.refund && (
          <p className="mt-1 border-2 border-black py-0.5 text-center text-xs font-bold tracking-[0.2em]">
            REFUNDED {new Date(order.refund.at).toLocaleDateString("en-NG")}
          </p>
        )}
        <div className="mt-1">
          <p className="flex justify-between">
            <span>Receipt</span>
            <span>#{order.id.slice(0, 8).toUpperCase()}</span>
          </p>
          <p className="flex justify-between">
            <span>Date</span>
            <span>{createdAt.toLocaleDateString("en-NG")}</span>
          </p>
          <p className="flex justify-between">
            <span>Time</span>
            <span>
              {createdAt.toLocaleTimeString("en-NG", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
          <p className="flex justify-between gap-2">
            <span>Customer</span>
            <span className="text-right">{order.customer.name}</span>
          </p>
        </div>

        <Divider />

        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-bold">
              <td>ITEM</td>
              <td className="text-right">AMOUNT</td>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={index} className="align-top">
                <td className="pt-1.5 pr-2">
                  <span className="font-bold">
                    {item.name ?? productNames[item.productId] ?? "Item"}
                  </span>
                  <br />
                  {item.quantity} × {money.format(item.unitPrice)}
                </td>
                <td className="pt-1.5 text-right whitespace-nowrap">
                  {money.format(item.unitPrice * item.quantity)}
                </td>
              </tr>
            ))}
            {order.gifts?.map((gift, index) => (
              <tr key={`gift-${index}`} className="align-top">
                <td className="pt-1.5 pr-2">
                  <span className="font-bold">{gift.name}</span>
                  <br />
                  {gift.quantity} × FREE GIFT
                </td>
                <td className="pt-1.5 text-right whitespace-nowrap">
                  {money.format(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Divider />

        <p className="flex justify-between">
          <span>Items</span>
          <span>{itemCount}</span>
        </p>
        <p className="mt-1 flex justify-between border-y-2 border-black py-1 text-sm font-bold">
          <span>TOTAL</span>
          <span>{money.format(order.total)}</span>
        </p>
        <p className="mt-1 flex justify-between">
          <span>Paid by</span>
          <span>{PAYMENT_LABELS[order.paymentMethod]}</span>
        </p>

        <Divider />

        <div className="text-center">
          <p className="font-display text-sm font-bold italic">
            Thank you for shopping with us!
          </p>
          <p className="mt-2">Follow us on Instagram {SHOP_INSTAGRAM}</p>
          <p>WhatsApp {SHOP_WHATSAPP}</p>
          <p>Shop online at {SHOP_WEBSITE}</p>
          {RECEIPT_NOTE && <p className="mt-2 text-[10px]">{RECEIPT_NOTE}</p>}
          <p className="mt-3 tracking-[0.4em]">✦ ✦ ✦</p>
        </div>
      </div>
    </div>
  );
}
