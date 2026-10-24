import { syncFromWooCommerce } from "./woocommerce";

// Runs the website sync once, now, instead of waiting for the nightly one.
// Stock, cost prices and barcodes in the POS are left alone.
syncFromWooCommerce()
  .then(({ added, updated, unchanged, skipped }) => {
    console.log(
      `Added ${added}, updated ${updated}, unchanged ${unchanged} products.`,
    );
    if (skipped.length)
      console.log(`Skipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
