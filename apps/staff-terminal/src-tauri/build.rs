fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .app_manifest(tauri_build::AppManifest::new().commands(&["print_receipt", "list_printer_ports", "print_raw"])),
  )
  .expect("failed to run tauri-build");
}
