import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef } from 'react';
import { formatBDT, type Paisa } from '@/lib/money';

export { TableViewport } from './TableViewport';

/* -------------------------------------------------------------------------- */

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-signal text-white hover:bg-signal/90 border-signal',
    ghost: 'bg-card text-ink hover:bg-plate border-rule',
    danger: 'bg-card text-out hover:bg-out-wash border-rule',
  }[variant];

  return (
    <button
      {...props}
      className={`inline-flex h-9 items-center justify-center rounded-[3px] border px-3.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-out">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-graphite">{hint}</span>
      ) : null}
    </label>
  );
}

/** A concise visible term with an explanation available on hover or keyboard focus. */
export function HelpTerm({
  children,
  description,
  placement = 'top',
  align = 'center',
}: {
  children: ReactNode;
  description: string;
  placement?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
}) {
  const vertical = placement === 'top'
    ? 'bottom-[calc(100%+0.4rem)]'
    : 'top-[calc(100%+0.4rem)]';
  const horizontal = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  }[align];

  return (
    <span className="inline-flex items-center gap-1">
      <span>{children}</span>
      <span
        tabIndex={0}
        aria-label={`${String(children)}: ${description}`}
        className="group relative inline-flex size-4 cursor-help items-center justify-center rounded-full border border-graphite/40 text-[10px] font-semibold normal-case text-graphite outline-none focus-visible:border-signal focus-visible:text-signal"
      >
        ?
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-[80] hidden w-64 rounded-[3px] bg-ink px-3 py-2 text-left text-[11px] font-normal normal-case leading-relaxed text-white shadow-lg group-hover:block group-focus:block ${vertical} ${horizontal}`}
        >
          {description}
        </span>
      </span>
    </span>
  );
}

const inputBase =
  'h-9 w-full rounded-[3px] border border-rule bg-card px-2.5 text-[13px] text-ink placeholder:text-graphite/80 focus:border-signal focus:outline-none';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${className}`} />;
}

/** Identifiers (SKU, serial, barcode) are always mono. */
export const MonoInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function MonoInput({ className = '', ...props }, ref) {
    return <input ref={ref} {...props} className={`${inputBase} tnum ${className}`} />;
  },
);

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputBase} ${className}`} />;
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-20 w-full rounded-[3px] border border-rule bg-card px-2.5 py-2 text-[13px] text-ink focus:border-signal focus:outline-none ${className}`}
    />
  );
}

/* -------------------------------------------------------------------------- */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[3px] border border-rule bg-card ${className}`}>{children}</div>
  );
}

export function PageHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{title}</h1>
        {count && <p className="tnum mt-0.5 text-[12px] text-graphite">{count}</p>}
      </div>
      {action && <div className="w-full sm:w-auto">{action}</div>}
    </header>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-[13px] text-graphite">{title}</p>
      {action}
    </div>
  );
}

/* --- Money ---------------------------------------------------------------- */

/** Formats at the display layer only. Never do arithmetic on this. */
export function Money({ value, muted = false }: { value: Paisa | null; muted?: boolean }) {
  if (value === null) return <span className="text-graphite">—</span>;
  return (
    <span className={`tnum text-[13px] ${muted ? 'text-graphite' : 'text-ink'}`}>
      {formatBDT(value)}
    </span>
  );
}

/* --- The signature: a serial number as an etched plate -------------------- */

export function SerialChip({ serial, dim = false }: { serial: string; dim?: boolean }) {
  return (
    <span
      className={`tnum inline-block rounded-[2px] border px-1.5 py-0.5 text-[12px] ${
        dim
          ? 'border-rule-soft bg-plate/60 text-graphite line-through decoration-graphite/40'
          : 'border-rule bg-plate text-ink'
      }`}
    >
      {serial}
    </span>
  );
}

/* --- Stock status --------------------------------------------------------- */

export type StockLevel = 'ok' | 'low' | 'out';

export function stockLevel(onHand: number, reorderPoint: number): StockLevel {
  if (onHand <= 0) return 'out';
  if (onHand <= reorderPoint) return 'low';
  return 'ok';
}

export function StockCount({ onHand, reorderPoint }: { onHand: number; reorderPoint: number }) {
  const level = stockLevel(onHand, reorderPoint);
  const tone = {
    ok: 'text-ink',
    low: 'text-low',
    out: 'text-out',
  }[level];
  const note = { ok: '', low: 'low', out: 'out of stock' }[level];

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`tnum text-[13px] font-medium ${tone}`}>{onHand}</span>
      {note && <span className={`text-[11px] ${tone}`}>{note}</span>}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'low' | 'out' | 'signal';
}) {
  const styles = {
    neutral: 'border-rule bg-plate text-graphite',
    ok: 'border-ok/20 bg-ok-wash text-ok',
    low: 'border-low/20 bg-low-wash text-low',
    out: 'border-out/20 bg-out-wash text-out',
    signal: 'border-signal/20 bg-signal-wash text-signal',
  }[tone];

  return (
    <span
      className={`inline-block rounded-[2px] border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase ${styles}`}
    >
      {children}
    </span>
  );
}
