"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { PaperWidth, PrinterLanguage } from "../lib/escpos";
import {
  listPrinterPorts,
  printTestPage,
  savedPrinter,
  savePrinter,
  type PrinterPort,
} from "../lib/print";
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SELECT } from "./form-styles";
import Icon from "./icons";
import Modal from "./modal";

/** Common label heights in mm; 0 is a plain roll. */
const STICKER_HEIGHTS = [30, 40, 50, 60, 70, 80, 100, 0];

/** True inside the desktop app (false while pre-rendering). */
export const useDesktopApp = () =>
  useSyncExternalStore(
    () => () => {},
    () => isTauri(),
    () => false,
  );

/**
 * Picks the receipt printer this computer prints to directly: a Bluetooth
 * printer paired in the computer's settings, or a USB one. Without one,
 * receipts go through the normal print window.
 */
export default function PrinterSettings({ onClose }: { onClose: () => void }) {
  const current = savedPrinter();
  const [ports, setPorts] = useState<PrinterPort[] | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [port, setPort] = useState(current?.port ?? "");
  const [paper, setPaper] = useState<PaperWidth>(current?.paper ?? "80");
  const [language, setLanguage] = useState<PrinterLanguage>(
    current?.language ?? "escpos",
  );
  // Label mode: the sticker height in mm, or 0 for a plain roll.
  const [stickerHeight, setStickerHeight] = useState(
    current?.stickerHeight ?? 50,
  );
  const printer = { port, paper, language, stickerHeight };
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  const refresh = useCallback(
    () =>
      listPrinterPorts()
        .then((found) => {
          setPorts(found);
          setPort((chosen) => chosen || (found[0]?.name ?? ""));
        })
        .catch(() => setUnsupported(true)),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const test = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await printTestPage(printer);
      setMessage({
        text:
          language === "escpos"
            ? "Sent. If a test page printed, click Save. If nothing printed, choose Label mode and test again. If the line of numbers wrapped, choose 58mm."
            : "Sent. If a test page printed on one sticker and stopped, click Save. If it ran past the sticker or stopped too early, check the sticker size. If nothing printed, choose Receipt mode.",
        ok: true,
      });
    } catch (e) {
      setMessage({ text: String(e), ok: false });
    } finally {
      setTesting(false);
    }
  };

  // The port list keeps the saved printer even while it is switched off.
  const choices =
    ports && port && !ports.some((p) => p.name === port)
      ? [...ports, { name: port, label: `${port} (not found now)` }]
      : (ports ?? []);

  return (
    <Modal title="Receipt printer" onClose={onClose}>
      {unsupported ? (
        <p className="text-sm">
          Printing straight to a receipt printer needs desktop app version 0.1.5
          or newer. Install the latest version, then try again.
        </p>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            First pair the printer in the computer&apos;s Bluetooth settings
            (PIN 0000 or 1234), or plug it in by USB. Then choose it here.
          </p>
          <label className="block font-medium">
            Printer
            <div className="mt-1 flex gap-2">
              <select
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className={`${SELECT} flex-1`}
              >
                {choices.length === 0 && <option value="">None found</option>}
                {choices.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void refresh()}
                className={SECONDARY_BUTTON}
              >
                Refresh
              </button>
            </div>
          </label>
          <label className="block font-medium">
            Paper roll
            <select
              value={paper}
              onChange={(e) => setPaper(e.target.value as PaperWidth)}
              className={`${SELECT} mt-1 w-full`}
            >
              <option value="80">80mm</option>
              <option value="58">58mm</option>
            </select>
          </label>
          <label className="block font-medium">
            Printer mode
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as PrinterLanguage)}
              className={`${SELECT} mt-1 w-full`}
            >
              <option value="escpos">
                Receipt mode (most receipt printers)
              </option>
              <option value="tspl">
                Label mode (if the printer prints &quot;judge fail&quot;)
              </option>
            </select>
          </label>
          {language === "tspl" && (
            <label className="block font-medium">
              Sticker size
              <select
                value={stickerHeight}
                onChange={(e) => setStickerHeight(Number(e.target.value))}
                className={`${SELECT} mt-1 w-full`}
              >
                {STICKER_HEIGHTS.map((height) => (
                  <option key={height} value={height}>
                    {height === 0
                      ? "Plain roll, no stickers"
                      : `${paper} × ${height}mm stickers`}
                  </option>
                ))}
              </select>
              <span className="mt-1 block font-normal text-muted">
                A long receipt is printed across several stickers.
              </span>
            </label>
          )}
          {message && (
            <p
              role="status"
              className={message.ok ? "text-emerald-800" : "text-red-700"}
            >
              {message.text}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            {current && (
              <button
                type="button"
                onClick={() => {
                  savePrinter(null);
                  onClose();
                }}
                className="mr-auto font-medium text-red-700 hover:underline"
              >
                Use the print window instead
              </button>
            )}
            <button
              type="button"
              disabled={!port || testing}
              onClick={() => void test()}
              className={SECONDARY_BUTTON}
            >
              <Icon name="printer" className="h-4 w-4" />
              {testing ? "Printing…" : "Test print"}
            </button>
            <button
              type="button"
              disabled={!port}
              onClick={() => {
                savePrinter(printer);
                onClose();
              }}
              className={PRIMARY_BUTTON}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
