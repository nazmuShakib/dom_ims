'use client';

import { QRCodeSVG } from 'qrcode.react';

export function ReceiptQRCode({ value }: { value: string }) {
  return <QRCodeSVG
    value={value}
    size={112}
    level="M"
    marginSize={1}
    bgColor="#ffffff"
    fgColor="#111827"
    className="emi-receipt-qr"
    aria-label="Scan for receipt details"
  />;
}
