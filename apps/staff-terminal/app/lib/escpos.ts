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

// The receipt as printer commands, for sending straight to a Bluetooth or
// USB printer without a driver. Receipt printers speak ESC/POS; printers
// that also print labels may be in label mode, where they speak TSPL.

export type PaperWidth = "58" | "80";
/** "escpos" for receipt mode, "tspl" for a printer in label mode. */
export type PrinterLanguage = "escpos" | "tspl";

/** Characters per line in the printer's normal font. */
export const LINE_WIDTH: Record<PaperWidth, number> = { "58": 32, "80": 48 };

/** One printed line. "double" text is twice as wide and tall; "tall" only taller. */
type Line = {
  text: string;
  center?: boolean;
  bold?: boolean;
  size?: "double" | "tall";
  /** Printed on the same sticker as the line after it. */
  keepWithNext?: boolean;
};

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

const price = (amount: number) => ascii(money.format(amount));

/** The till's receipt for `order`, as lines for a `width`-character roll. */
function receiptLines(
  order: Order,
  productNames: Record<string, string>,
  width: number,
  copy: boolean,
): Line[] {
  const rule: Line = { text: "-".repeat(width) };
  const plain = (texts: string[], style: Omit<Line, "text"> = {}): Line[] =>
    texts.map((text) => ({ text, ...style }));
  const centered = (text: string) => plain(wrap(text, width), { center: true });
  const field = (
    label: string,
    value: string,
    style: Omit<Line, "text"> = {},
  ) => plain(columns(label, value, width), style);
  const createdAt = new Date(order.createdAt);
  const items = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return [
    ...plain(wrap(SHOP_NAME, Math.floor(width / 2)), {
      center: true,
      bold: true,
      size: "double",
    }),
    ...(SHOP_ADDRESS ? centered(SHOP_ADDRESS) : []),
    ...(SHOP_PHONE ? centered(`Tel: ${SHOP_PHONE}`) : []),
    ...centered(SHOP_WEBSITE),
    rule,
    { text: "SALES RECEIPT", center: true, bold: true },
    ...(copy ? centered("COPY") : []),
    ...(order.refund
      ? [
          {
            text: `*** REFUNDED ${new Date(order.refund.at).toLocaleDateString("en-NG")} ***`,
            center: true,
            bold: true,
          },
        ]
      : []),
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
      ...plain(
        wrap(item.name ?? productNames[item.productId] ?? "Item", width),
        { bold: true, keepWithNext: true },
      ),
      ...plain(
        columns(
          `${item.quantity} x ${price(item.unitPrice)}`,
          price(item.unitPrice * item.quantity),
          width,
        ),
      ),
    ]),
    ...(order.gifts ?? []).flatMap((gift) => [
      ...plain(wrap(gift.name, width), { bold: true, keepWithNext: true }),
      ...plain(columns(`${gift.quantity} x FREE GIFT`, price(0), width)),
    ]),
    rule,
    ...field("Items", String(items)),
    ...field("TOTAL", price(order.total), { bold: true, size: "tall" }),
    ...field("Paid by", PAYMENT_LABELS[order.paymentMethod]),
    rule,
    { text: "Thank you for shopping with us!", center: true, bold: true },
    { text: "" },
    ...centered(`Follow us on Instagram ${SHOP_INSTAGRAM}`),
    ...centered(`WhatsApp ${SHOP_WHATSAPP}`),
    ...centered(`Shop online at ${SHOP_WEBSITE}`),
    ...(RECEIPT_NOTE ? [{ text: "" }, ...centered(RECEIPT_NOTE)] : []),
    { text: "" },
    { text: "* * *", center: true },
  ];
}

/** A short page to check the printer is connected and the width is right. */
function testLines(width: number): Line[] {
  return [
    { text: SHOP_NAME, center: true, bold: true, size: "tall" },
    { text: "Printer test", center: true },
    { text: "-".repeat(width) },
    // A ruler: the line should fill the paper without wrapping.
    { text: "1234567890".repeat(Math.ceil(width / 10)).slice(0, width) },
    ...columns("Left", "Right", width).map((text) => ({ text })),
    { text: "-".repeat(width) },
    ...wrap("If this prints neatly, receipts will too.", width).map((text) => ({
      text,
      center: true,
    })),
  ];
}

// --- ESC/POS (receipt mode) -------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;
const SIZE_CODES = { normal: 0x00, double: 0x11, tall: 0x01 };

function escpos(lines: Line[]): number[] {
  const bytes = [ESC, 0x40];
  for (const line of lines) {
    bytes.push(ESC, 0x61, line.center ? 1 : 0);
    bytes.push(ESC, 0x45, line.bold ? 1 : 0);
    bytes.push(GS, 0x21, SIZE_CODES[line.size ?? "normal"]);
    for (const c of ascii(line.text) + "\n") bytes.push(c.charCodeAt(0));
  }
  // Back to normal text, then feed the paper past the tear bar.
  bytes.push(GS, 0x21, 0, ESC, 0x45, 0);
  for (const c of "\n\n\n\n") bytes.push(c.charCodeAt(0));
  return bytes;
}

// --- TSPL (label mode) --------------------------------------------------------

// At 203 dots per inch (8 per mm), font "2" is 12 dots wide and 20 tall, so
// a line of LINE_WIDTH characters fills the roll.
const DOTS_PER_MM = 8;
const CHAR_DOTS = 12;
const LINE_DOTS = 26;
/** Blank space at the top and bottom of each sticker. */
const MARGIN_DOTS = 12;

/**
 * Label-mode commands. On stickers (`stickerHeight` mm tall) the receipt is
 * split into sticker-sized pieces, so the printer stops at the end of the
 * last sticker used; with 0 it is one piece on continuous paper.
 */
function tspl(
  lines: Line[],
  paper: PaperWidth,
  stickerHeight: number,
): number[] {
  const width = LINE_WIDTH[paper];
  const pageDots = stickerHeight * DOTS_PER_MM - MARGIN_DOTS;
  const pages: string[][] = [[]];
  let y = MARGIN_DOTS;
  const lineDots = (line: Line) => LINE_DOTS * (line.size ? 2 : 1);
  for (const [index, line] of lines.entries()) {
    const scale = line.size === "double" ? 2 : 1;
    const tall = line.size ? 2 : 1;
    const height = lineDots(line);
    // The space this line needs with the lines it is kept with.
    let needed = height;
    for (let i = index; lines[i]?.keepWithNext && lines[i + 1]; i++)
      needed += lineDots(lines[i + 1]);
    // A group starting mid-way is already on its sticker.
    if (index > 0 && lines[index - 1].keepWithNext) needed = height;
    if (
      stickerHeight > 0 &&
      y + Math.min(needed, pageDots - MARGIN_DOTS) > pageDots &&
      pages.at(-1)!.length > 0
    ) {
      pages.push([]);
      y = MARGIN_DOTS;
    }
    // Quotes would end the text early.
    const text = ascii(line.text).replace(/"/g, "'");
    const x = line.center
      ? Math.max(0, Math.floor(((width - text.length * scale) * CHAR_DOTS) / 2))
      : 0;
    if (text.trim()) {
      pages.at(-1)!.push(`TEXT ${x},${y},"2",0,${scale},${tall},"${text}"`);
      // Bold: print again one dot to the right.
      if (line.bold)
        pages
          .at(-1)!
          .push(`TEXT ${x + 1},${y},"2",0,${scale},${tall},"${text}"`);
    }
    y += height;
  }
  const height =
    stickerHeight > 0
      ? stickerHeight
      : Math.ceil((y + MARGIN_DOTS * 3) / DOTS_PER_MM);
  const program = [
    `SIZE ${paper === "80" ? 72 : 48} mm,${height} mm`,
    // The usual 2mm gap between stickers; none on continuous paper.
    stickerHeight > 0 ? "GAP 2 mm,0 mm" : "GAP 0 mm,0 mm",
    "DIRECTION 0",
    ...pages.flatMap((page) => ["CLS", ...page, "PRINT 1"]),
    "",
  ].join("\r\n");
  return [...program].map((c) => c.charCodeAt(0));
}

/** How the chosen printer wants its commands. */
export type PrintFormat = {
  paper: PaperWidth;
  language: PrinterLanguage;
  /** Label mode only: sticker height in mm, or 0 for continuous paper. */
  stickerHeight?: number;
};

const encode = (lines: Line[], format: PrintFormat) =>
  new Uint8Array(
    format.language === "tspl"
      ? tspl(lines, format.paper, format.stickerHeight ?? 0)
      : escpos(lines),
  );

/** The till's receipt for `order`, ready to send to the printer. */
export function receiptCommands(
  order: Order,
  productNames: Record<string, string>,
  format: PrintFormat,
  copy = false,
): Uint8Array {
  return encode(
    receiptLines(order, productNames, LINE_WIDTH[format.paper], copy),
    format,
  );
}

export function testCommands(format: PrintFormat): Uint8Array {
  return encode(testLines(LINE_WIDTH[format.paper]), format);
}
