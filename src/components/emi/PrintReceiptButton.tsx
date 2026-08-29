'use client';

import { useEffect, useState } from 'react';
import { Button, Select } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { thermalPageHeightMm } from '@/lib/thermal-print-page';

type ReceiptLayout = 'a4' | 'thermal80' | 'thermal58';

export function PrintReceiptButton({ contractId, paymentId }: { contractId: string; paymentId: string }) {
  const { t } = useI18n();
  const [layout, setLayout] = useState<ReceiptLayout>('thermal80');
  const [thermalPageHeight, setThermalPageHeight] = useState(210);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.emi-receipt-root');
    if (!root) return;
    root.dataset.layout = layout === 'a4' ? 'a4' : 'thermal';
    root.dataset.thermalWidth = layout === 'thermal58' ? '58' : '80';
    root.style.setProperty('--emi-thermal-width', layout === 'thermal58' ? '58mm' : '80mm');

    if (layout === 'a4') return;
    const documentElement = root.querySelector<HTMLElement>('.emi-receipt-document');
    if (!documentElement) return;

    let cancelled = false;
    const updatePageHeight = () => {
      if (cancelled) return;
      const nextHeight = thermalPageHeightMm(documentElement.scrollHeight);
      setThermalPageHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
    };

    updatePageHeight();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePageHeight);
    resizeObserver?.observe(documentElement);
    void document.fonts?.ready.then(updatePageHeight);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [layout]);

  function changeLayout(next: ReceiptLayout) {
    setLayout(next);
  }

  function printReceipt() {
    window.print();
  }

  const printPageSize = layout === 'a4'
    ? 'A4 portrait'
    : `${layout === 'thermal58' ? 58 : 80}mm ${thermalPageHeight}mm`;

  return <>
    <style>{`@media print { @page { size: ${printPageSize}; margin: 0; } }`}</style>
    <div className="print:hidden" data-contract-id={contractId} data-payment-id={paymentId}>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <Select aria-label={t('emi.receiptLayout')} className="!w-52 shrink-0" value={layout} onChange={(event) => changeLayout(event.target.value as ReceiptLayout)}>
          <option value="a4">{t('emi.a4Printer')}</option>
          <option value="thermal80">{t('emi.thermalPrinter')}</option>
          <option value="thermal58">{t('emi.thermal58Printer')}</option>
        </Select>
        <Button type="button" onClick={printReceipt}>{t('emi.printReceipt')}</Button>
      </div>
    </div>
  </>;
}
