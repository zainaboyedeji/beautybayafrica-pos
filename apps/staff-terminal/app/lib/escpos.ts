import type { Order } from "@pos/types";
import {
  PAYMENT_LABELS,
  RECEIPT_NOTE,
  SHOP_ADDRESS,
  SHOP_INSTAGRAM,
  SHOP_NAME,
  SHOP_PHONE,
  SHOP_WEBSITE,
  SHOP_WHATSAPP,
} from "../components/receipt";
import { money } from "./api";

// The receipt as ESC/POS commands, the language of receipt printers, for
// sending straight to a Bluetooth or USB printer without a driver.

/** Characters per line in the printer's normal font. */
export const LINE_WIDTH: Record<PaperWidth, number> = { "58": 32, "80": 48 };
export type PaperWidth = "58" | "80";

const ESC = 0x1b;
const GS = 0x1d;
const INIT = [ESC, 0x40];
const align = (where: "left" | "center") => [
  ESC,
  0x61,
  where === "center" ? 1 : 0,
];
const bold = (on: boolean) => [ESC, 0x45, on ? 1 : 0];
/** "double" is twice as wide and tall; "tall" only twice as tall. */
const SIZES = { normal: 0x00, double: 0x11, tall: 0x01 };
const size = (s: keyof typeof SIZES) => [GS, 0x21, SIZES[s]];

// Printers only know plain ASCII here, so swap what they can't print.
const REPLACEMENTS: Record<string, string> = {
  "₦": "N",
  "—": "-",
  "–": "-",
  "×": "x",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "✦": "*",
  " ": " ",
};
const ascii = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(
      /./gu,
      (c) => REPLACEMENTS[c] ?? (c.charCodeAt(0) < 128 ? c : "?"),
    );

/** Splits text into lines of at most `width` characters, at spaces. */
const wrap = (text: string, width: number) => {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    for (let piece = word; piece; piece = piece.slice(width)) {
      const part = piece.slice(0, width);
      if (!line) line = part;
      else if (line.length + 1 + part.length <= width) line += ` ${part}`;
      else {
        lines.push(line);
        line = part;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
};

/** Left text and right text on one line, the right one flush right. */
const columns = (left: string, right: string, width: number) => {
  const room = Math.max(1, width - right.length - 1);
  const lines = wrap(left, room);
  const last = lines.pop() ?? "";
  return [
    ...lines,
    last + " ".repeat(width - last.length - right.length) + right,
  ];
};

type Line = number[] | string;

const encode = (parts: Line[]) => {
  const bytes: number[] = [];
  for (const part of parts) {
    if (typeof part === "string")
      for (const c of ascii(part) + "\n") bytes.push(c.charCodeAt(0));
    else bytes.push(...part);
  }
  return new Uint8Array(bytes);
};

const price = (amount: number) => ascii(money.format(amount));

/** The till's receipt for `order`, ready to send to the printer. */
export function receiptCommands(
  order: Order,
  productNames: Record<string, string>,
  paper: PaperWidth,
  copy = false,
): Uint8Array {
  const width = LINE_WIDTH[paper];
  const rule = "-".repeat(width);
  const createdAt = new Date(order.createdAt);
  const items = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const field = (label: string, value: string) => columns(label, value, width);

  return encode([
    INIT,
    align("center"),
    bold(true),
    size(paper === "80" ? "double" : "tall"),
    ...wrap(SHOP_NAME, paper === "80" ? width / 2 : width),
    size("normal"),
    bold(false),
    ...(SHOP_ADDRESS ? wrap(SHOP_ADDRESS, width) : []),
    ...(SHOP_PHONE ? [`Tel: ${SHOP_PHONE}`] : []),
    SHOP_WEBSITE,
    rule,
    bold(true),
    "SALES RECEIPT",
    bold(false),
    ...(copy ? ["COPY"] : []),
    ...(order.refund
      ? [
          bold(true),
          `*** REFUNDED ${new Date(order.refund.at).toLocaleDateString("en-NG")} ***`,
          bold(false),
        ]
      : []),
    align("left"),
    ...field("Receipt", `#${order.id.slice(0, 8).toUpperCase()}`),
    ...field("Date", createdAt.toLocaleDateString("en-NG")),
    ...field(
      "Time",
      createdAt.toLocaleTimeString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    ),
    ...field("Customer", order.customer.name),
    rule,
    ...order.items.flatMap((item) => [
      bold(true),
      ...wrap(item.name ?? productNames[item.productId] ?? "Item", width),
      bold(false),
      ...columns(
        `  ${item.quantity} x ${price(item.unitPrice)}`,
        price(item.unitPrice * item.quantity),
        width,
      ),
    ]),
    rule,
    ...field("Items", String(items)),
    bold(true),
    size("tall"),
    ...field("TOTAL", price(order.total)),
    size("normal"),
    bold(false),
    ...field("Paid by", PAYMENT_LABELS[order.paymentMethod]),
    rule,
    align("center"),
    bold(true),
    "Thank you for shopping with us!",
    bold(false),
    "",
    ...wrap(`Follow us on Instagram ${SHOP_INSTAGRAM}`, width),
    `WhatsApp ${SHOP_WHATSAPP}`,
    ...wrap(`Shop online at ${SHOP_WEBSITE}`, width),
    ...(RECEIPT_NOTE ? ["", ...wrap(RECEIPT_NOTE, width)] : []),
    "",
    "* * *",
    // Feed the paper past the tear bar.
    "\n\n\n",
  ]);
}

/** A short page to check the printer is connected and the width is right. */
export function testCommands(paper: PaperWidth): Uint8Array {
  const width = LINE_WIDTH[paper];
  return encode([
    INIT,
    align("center"),
    bold(true),
    size("tall"),
    SHOP_NAME,
    size("normal"),
    bold(false),
    "Printer test",
    "-".repeat(width),
    align("left"),
    // A ruler: the line should fill the paper without wrapping.
    "1234567890".repeat(Math.ceil(width / 10)).slice(0, width),
    ...columns("Left", "Right", width),
    align("center"),
    "-".repeat(width),
    "If this prints neatly, receipts will too.",
    "\n\n\n",
  ]);
}
