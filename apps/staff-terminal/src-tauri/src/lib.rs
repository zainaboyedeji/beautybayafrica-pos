use std::{io::Write, thread, time::Duration};

// The webview ignores window.print(), so the page asks the app to print.
// It says how big the receipt is, in mm: a Mac otherwise prints it on a
// whole page of the printer's default paper, feeding a long blank strip.
#[tauri::command]
fn print_receipt(
  window: tauri::WebviewWindow,
  width: Option<f64>,
  height: Option<f64>,
) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  if let (Some(width), Some(height)) = (width, height) {
    return window
      .with_webview(move |webview| unsafe { mac::print(webview.inner().cast(), width, height) })
      .map_err(|e| e.to_string());
  }
  let _ = (width, height);
  window.print().map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
mod mac {
  use objc2_app_kit::{NSPrintInfo, NSPrintingPaginationMode};
  use objc2_foundation::{NSCopying, NSSize};
  use objc2_web_kit::WKWebView;

  /// Opens the print window for the page on `width` x `height` mm paper,
  /// with no margins, shrunk to one page if it is a little too long.
  pub unsafe fn print(webview: *mut WKWebView, width: f64, height: f64) {
    let Some(webview) = (unsafe { webview.as_ref() }) else { return };
    let Some(window) = webview.window() else { return };
    let points = |mm: f64| mm * 72.0 / 25.4;
    let info = NSPrintInfo::sharedPrintInfo().copy();
    info.setPaperSize(NSSize::new(points(width), points(height)));
    info.setTopMargin(0.0);
    info.setBottomMargin(0.0);
    info.setLeftMargin(0.0);
    info.setRightMargin(0.0);
    info.setHorizontallyCentered(false);
    info.setVerticallyCentered(false);
    info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
    info.setVerticalPagination(NSPrintingPaginationMode::Fit);
    unsafe {
      let operation = webview.printOperationWithPrintInfo(&info);
      operation.setCanSpawnSeparateThread(true);
      operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
        &window,
        None,
        None,
        std::ptr::null_mut(),
      );
    }
  }
}

/// A port a receipt printer can be reached on: a paired Bluetooth printer's
/// COM port on Windows (/dev/cu.* on a Mac), or a USB one.
#[derive(serde::Serialize)]
struct PrinterPort {
  name: String,
  label: String,
}

#[tauri::command]
fn list_printer_ports() -> Result<Vec<PrinterPort>, String> {
  let ports = serialport::available_ports().map_err(|e| e.to_string())?;
  #[cfg(windows)]
  let installed = windows_printer::installed();
  #[cfg(not(windows))]
  let installed = Vec::new();
  Ok(
    ports
      .into_iter()
      // A Mac lists each device twice; /dev/cu.* is the one to send to. Its
      // own "Bluetooth-Incoming-Port" is never a printer.
      .filter(|p| !p.port_name.starts_with("/dev/tty.") && !p.port_name.contains("Incoming-Port"))
      .map(|p| {
        let kind = match &p.port_type {
          serialport::SerialPortType::BluetoothPort => " (Bluetooth)".to_string(),
          serialport::SerialPortType::UsbPort(usb) => usb
            .product
            .as_ref()
            .map(|name| format!(" ({name})"))
            .unwrap_or_else(|| " (USB)".to_string()),
          _ => String::new(),
        };
        let short = p.port_name.trim_start_matches("/dev/cu.").to_string();
        PrinterPort { label: format!("{short}{kind}"), name: p.port_name }
      })
      .chain(installed)
      .collect(),
  )
}

/// Sends raw printer commands (ESC/POS) to a port, a piece at a time so a
/// small Bluetooth printer's buffer doesn't overflow.
fn send(port: &str, data: &[u8]) -> Result<(), String> {
  #[cfg(windows)]
  if let Some(name) = port.strip_prefix(windows_printer::PREFIX) {
    return windows_printer::send(name, data);
  }
  let mut printer = serialport::new(port, 9600)
    .timeout(Duration::from_secs(10))
    .open()
    .map_err(|e| format!("Could not connect to the printer on {port}: {e}"))?;
  for chunk in data.chunks(256) {
    printer
      .write_all(chunk)
      .map_err(|e| format!("The printer stopped responding: {e}"))?;
    thread::sleep(Duration::from_millis(30));
  }
  printer.flush().map_err(|e| e.to_string())?;
  // Bluetooth sends in the background; closing at once can cut the end off.
  thread::sleep(Duration::from_millis(1500));
  Ok(())
}

/// Printers installed in Windows, e.g. a USB receipt printer with its
/// driver. Their print window feeds a whole page of the driver's paper size,
/// so receipts are sent to them as raw commands, which the driver passes on
/// untouched.
#[cfg(windows)]
mod windows_printer {
  use super::PrinterPort;
  use windows::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
    StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
    PRINTER_HANDLE, PRINTER_INFO_4W,
  };
  use windows::core::{HSTRING, PCWSTR, PWSTR, w};

  /// Starts the port name of an installed printer, to tell it from a COM port.
  pub const PREFIX: &str = "printer:";

  pub fn installed() -> Vec<PrinterPort> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let (mut needed, mut count) = (0, 0);
    unsafe {
      let _ = EnumPrintersW(flags, PCWSTR::null(), 4, None, &mut needed, &mut count);
      // PRINTER_INFO_4W holds pointers, so the buffer must be aligned for them.
      let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
      let bytes = std::slice::from_raw_parts_mut(buffer.as_mut_ptr().cast::<u8>(), needed as usize);
      if EnumPrintersW(flags, PCWSTR::null(), 4, Some(bytes), &mut needed, &mut count).is_err() {
        return Vec::new();
      }
      std::slice::from_raw_parts(buffer.as_ptr().cast::<PRINTER_INFO_4W>(), count as usize)
        .iter()
        .filter_map(|p| p.pPrinterName.to_string().ok())
        .map(|name| PrinterPort {
          label: format!("{name} (installed printer)"),
          name: format!("{PREFIX}{name}"),
        })
        .collect()
    }
  }

  pub fn send(name: &str, data: &[u8]) -> Result<(), String> {
    let mut printer = PRINTER_HANDLE::default();
    unsafe {
      OpenPrinterW(&HSTRING::from(name), &mut printer, None)
        .map_err(|e| format!("Could not connect to the printer {name}: {e}"))?;
      let doc = DOC_INFO_1W {
        pDocName: PWSTR(w!("Receipt").as_ptr().cast_mut()),
        pOutputFile: PWSTR::null(),
        pDatatype: PWSTR(w!("RAW").as_ptr().cast_mut()),
      };
      let mut written = 0;
      let sent = StartDocPrinterW(printer, 1, &doc) != 0
        && StartPagePrinter(printer).as_bool()
        && WritePrinter(printer, data.as_ptr().cast(), data.len() as u32, &mut written).as_bool()
        && written as usize == data.len();
      let _ = EndPagePrinter(printer);
      let _ = EndDocPrinter(printer);
      let _ = ClosePrinter(printer);
      if sent { Ok(()) } else { Err(format!("The printer {name} stopped responding")) }
    }
  }
}

#[tauri::command]
async fn print_raw(port: String, data: Vec<u8>) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || send(&port, &data))
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![print_receipt, list_printer_ports, print_raw])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

