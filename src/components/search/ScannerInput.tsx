'use client';

import { forwardRef, useRef, type ComponentProps } from 'react';
import { MonoInput } from '@/components/ui';

export const ScannerInput = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof MonoInput>, 'onKeyDown' | 'onChange'> & {
  onScan?: (value: string) => void;
  onValueChange?: (value: string) => void;
}>(function ScannerInput({
  onScan,
  onValueChange,
  ...props
}, forwardedRef) {
  const last = useRef<{ value: string; at: number } | null>(null);

  return (
    <MonoInput
      ref={forwardedRef}
      {...props}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = event.currentTarget.value.trim();
        if (!value) return;
        const now = Date.now();
        if (last.current?.value === value && now - last.current.at < 750) {
          return;
        }
        last.current = { value, at: now };
        onScan?.(value);
      }}
    />
  );
});
