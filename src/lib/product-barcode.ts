const BARCODE_MIN = 100_000_000_000_000n;
const BARCODE_RANGE = 900_000_000_000_000n;

/**
 * Creates a scanner-friendly 15-digit product barcode.
 *
 * Fifteen numeric digits use compact Code 128C encoding and fit the 38 mm,
 * 203-DPI label at two printer dots per module. Web Crypto provides enough
 * entropy that collisions are exceptionally unlikely; the database's unique
 * barcode constraint remains the final authority when the product is saved.
 */
export function generateNumericProductBarcode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let entropy = 0n;
  for (const byte of bytes) entropy = (entropy << 8n) | BigInt(byte);
  return (BARCODE_MIN + (entropy % BARCODE_RANGE)).toString();
}
