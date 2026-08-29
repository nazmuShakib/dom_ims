import { reconcile } from '@/services/stock';

async function main() {
  const drifts = await reconcile();
  if (drifts.length === 0) {
    console.log('Reconciliation OK: every product matches its append-only ledger.');
    return;
  }

  console.error(`Reconciliation failed for ${drifts.length} product(s):`);
  for (const drift of drifts) {
    console.error(
      `${drift.sku}: on-hand=${drift.onHand}, ledger=${drift.ledgerSum}, drift=${drift.drift}`,
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
