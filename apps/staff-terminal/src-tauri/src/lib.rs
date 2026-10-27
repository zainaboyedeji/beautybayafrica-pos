use std::{io::Write, thread, time::Duration};

// The webview ignores window.print(), so the page asks the app to print.
#[tauri::command]
fn print_receipt(window: tauri::WebviewWindow) -> Result<(), String> {
  window.print().map_err(|e| e.to_string())
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
      .collect(),
  )
}

/// Sends raw printer commands (ESC/POS) to a port, a piece at a time so a
/// small Bluetooth printer's buffer doesn't overflow.
fn send(port: &str, data: &[u8]) -> Result<(), String> {
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

