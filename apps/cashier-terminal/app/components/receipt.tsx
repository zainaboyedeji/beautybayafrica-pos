import type { Order, PaymentMethod } from "@pos/types";
import { money } from "../lib/api";

const SHOP_NAME = process.env.NEXT_PUBLIC_SHOP_NAME ?? "Receipt";
const SHOP_ADDRESS = process.env.NEXT_PUBLIC_SHOP_ADDRESS;
const SHOP_PHONE = process.env.NEXT_PUBLIC_SHOP_PHONE;

// Printable width for each paper roll; thermal printers leave a margin.
const PAPER_WIDTHS: Record<string, string> = { "58": "48mm", "80": "72mm" };
const PAPER_WIDTH =
  PAPER_WIDTHS[process.env.NEXT_PUBLIC_RECEIPT_PAPER ?? "80"] ?? "72mm";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  transfer: "Bank transfer",
  card: "Card",
};

type Props = { order: Order; productNames: Record<string, string> };

/** Hidden on screen; it is the only thing on the page when printing. */
export default function Receipt({ order, productNames }: Props) {
  return (
    <div
      className="hidden bg-white font-mono text-[11px] leading-snug text-black print:block"
      style={{ width: PAPER_WIDTH }}
    >
      <style>{`@page { margin: 0; } @media print { html, body { background: #fff; } }`}</style>
      <div className="px-1 py-2">
        <div className="text-center">
          <p className="text-sm font-bold">{SHOP_NAME}</p>
          {SHOP_ADDRESS && <p>{SHOP_ADDRESS}</p>}
          {SHOP_PHONE && <p>Tel: {SHOP_PHONE}</p>}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-1">
          <p>{new Date(order.createdAt).toLocaleString("en-NG")}</p>
          <p>Receipt #{order.id.slice(0, 8).toUpperCase()}</p>
          <p>Customer: {order.customer.name}</p>
        </div>

        <table className="mt-1 w-full border-t border-dashed border-black">
          <tbody>
            {order.items.map((item, index) => (
              <tr key={index} className="align-top">
                <td className="pt-1">
                  {item.name ?? productNames[item.productId] ?? "Item"}
                  <br />
                  {item.quantity} × {money.format(item.unitPrice)}
                </td>
                <td className="pt-1 text-right whitespace-nowrap">
                  {money.format(item.unitPrice * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-1 border-t border-dashed border-black pt-1">
          <p className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span>{money.format(order.total)}</span>
          </p>
          <p className="flex justify-between">
            <span>Paid by</span>
            <span>{PAYMENT_LABELS[order.paymentMethod]}</span>
          </p>
        </div>

        <p className="mt-3 text-center">Thank you for your purchase!</p>
      </div>
    </div>
  );
}
