import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Order } from "@pos/types";
import { receiptCommands, testCommands, type PrintFormat } from "./escpos";

/** Opens the print dialog; the desktop app's webview needs Tauri to do it. */
export async function printPage() {
  if (!isTauri()) return window.print();
  try {
    await invoke("print_receipt");
  } catch {
    window.print();
  }
}

// --- Printing straight to a receipt printer (desktop app only) -------------

/** A port a printer can be reached on, as the desktop app lists them. */
export type PrinterPort = { name: string; label: string };
/**
 * The printer this computer sends receipts to, with its paper roll width,
 * whether it is in receipt mode ("escpos") or label mode ("tspl") and, in
 * label mode, the sticker height.
 */
export type DirectPrinter = PrintFormat & { port: string };

const PRINTER_KEY = "pos-receipt-printer";

/** The chosen printer, saved per computer; null means use the print window. */
export function savedPrinter(): DirectPrinter | null {
  if (!isTauri()) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(PRINTER_KEY) ?? "null");
    // Printers saved before label mode existed are in receipt mode.
    return saved?.port ? { language: "escpos", ...saved } : null;
  } catch {
    return null;
  }
}

export function savePrinter(printer: DirectPrinter | null) {
  try {
    if (printer) localStorage.setItem(PRINTER_KEY, JSON.stringify(printer));
    else localStorage.removeItem(PRINTER_KEY);
  } catch {}
}

/** Fails in the browser and in desktop apps older than version 0.1.5. */
export const listPrinterPorts = () =>
  invoke<PrinterPort[]>("list_printer_ports");

const send = (port: string, commands: Uint8Array) =>
  invoke("print_raw", { port, data: Array.from(commands) });

// A Bluetooth printer that has just woken up can miss the first
// connection, so a failed print is tried once more before giving up.
async function sendToPrinter(port: string, commands: Uint8Array) {
  try {
    await send(port, commands);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await send(port, commands);
  }
}

export const printTestPage = (printer: DirectPrinter) =>
  sendToPrinter(printer.port, testCommands(printer));

/**
 * Prints a sale's receipt: straight to the chosen printer in the desktop
 * app, otherwise through the print window, which shows the <Receipt> the
 * page has rendered. Returns why the printer failed, when it did (the print
 * window opens instead).
 */
export async function printOrderReceipt(
  order: Order,
  productNames: Record<string, string>,
  copy = false,
): Promise<string | null> {
  const printer = savedPrinter();
  if (printer) {
    try {
      await sendToPrinter(
        printer.port,
        receiptCommands(order, productNames, printer, copy),
      );
      return null;
    } catch (e) {
      await printPage();
      return `The receipt printer didn't respond (${String(e)}), so the print window opened instead. Check it is on and paired.`;
    }
  }
  await printPage();
  return null;
}
