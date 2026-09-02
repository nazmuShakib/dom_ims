'use client';

import { useEffect, useRef } from 'react';

const BURST_GAP_MS = 80;
const SUFFIX_GAP_MS = 120;
const MIN_IDENTIFIER_LENGTH = 2;

interface ScannerBuffer {
  value: string;
  lastKeyAt: number;
  prefixed: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(
    'input, textarea, select, [contenteditable="true"], [role="textbox"]',
  ));
}

function hasBlockingOverlay(): boolean {
  return Boolean(document.querySelector(
    '[data-scanner-blocking="true"], [role="alertdialog"], [role="dialog"][aria-modal="true"], [role="listbox"]',
  ));
}

/**
 * Captures keyboard-wedge scanner bursts while checkout is active.
 *
 * Normal scans work whenever focus is outside an editable control. A scanner
 * configured with F9 as its prefix is captured even while an input is focused,
 * so its characters never alter the active field.
 */
export function useCheckoutScanner({
  disabled,
  onScan,
}: {
  disabled: boolean;
  onScan: (identifier: string) => void;
}) {
  const bufferRef = useRef<ScannerBuffer>({ value: '', lastKeyAt: 0, prefixed: false });

  useEffect(() => {
    const reset = () => {
      bufferRef.current = { value: '', lastKeyAt: 0, prefixed: false };
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        disabled
        || document.hidden
        || hasBlockingOverlay()
        || event.isComposing
        || event.repeat
        || event.ctrlKey
        || event.metaKey
        || event.altKey
      ) {
        reset();
        return;
      }

      const editable = isEditableTarget(event.target);
      if (event.key === 'F9') {
        bufferRef.current = { value: '', lastKeyAt: event.timeStamp, prefixed: true };
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const current = bufferRef.current;
      if (event.key === 'Enter' || event.key === 'Tab') {
        const identifier = current.value.trim();
        const recent = event.timeStamp - current.lastKeyAt <= SUFFIX_GAP_MS;
        const capture = (current.prefixed || !editable)
          && recent
          && identifier.length >= MIN_IDENTIFIER_LENGTH;
        reset();
        if (!capture) return;
        event.preventDefault();
        event.stopPropagation();
        onScan(identifier);
        return;
      }

      if (event.key.length !== 1 || event.key.trim().length === 0) return;
      if (editable && !current.prefixed) {
        reset();
        return;
      }

      const expired = current.lastKeyAt > 0 && event.timeStamp - current.lastKeyAt > BURST_GAP_MS;
      bufferRef.current = {
        value: `${expired ? '' : current.value}${event.key}`,
        lastKeyAt: event.timeStamp,
        prefixed: current.prefixed,
      };
      if (current.prefixed) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [disabled, onScan]);
}
