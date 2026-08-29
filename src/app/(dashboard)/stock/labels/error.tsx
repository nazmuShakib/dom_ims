'use client';

import { Button, Card } from '@/components/ui';

export default function StockLabelsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="p-6">
      <p className="eyebrow text-out">Could not load product labels</p>
      <p className="mt-2 text-[13px] text-graphite">
        The selected product data could not be loaded. Your inventory was not changed.
      </p>
      <Button className="mt-4" type="button" variant="ghost" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
