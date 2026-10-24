import { invoke, isTauri } from "@tauri-apps/api/core";

/** Opens the print dialog; the desktop app's webview needs Tauri to do it. */
export async function printPage() {
  if (!isTauri()) return window.print();
  try {
    await invoke("print_receipt");
  } catch {
    window.print();
  }
}
