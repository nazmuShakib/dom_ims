'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { LabelProductOption } from '@/components/labels/StockLabelStudio';

export function LabelProductCombobox({
  products,
  value,
  disabled,
  placeholder,
  emptyMessage,
  onChange,
}: {
  products: LabelProductOption[];
  value: string;
  disabled?: boolean;
  placeholder: string;
  emptyMessage: string;
  onChange: (productId: string) => void;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = products.find((product) => product.id === value) ?? null;
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) =>
      `${product.name} ${product.sku} ${product.barcode ?? ''} ${product.model ?? ''}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [products, query]);

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, matches.length - 1)));
  }, [matches.length]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    const selectedIndex = selected
      ? products.findIndex((product) => product.id === selected.id)
      : 0;
    setActiveIndex(Math.max(0, selectedIndex));
  }

  function choose(product: LabelProductOption) {
    setOpen(false);
    setQuery('');
    if (product.id !== value) onChange(product.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return openList();
      if (matches.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + delta + matches.length) % matches.length);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const product = matches[activeIndex];
      if (product) choose(product);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex h-9 items-center rounded-[3px] border border-rule bg-card focus-within:border-signal">
        <Search aria-hidden="true" className="ml-2.5 size-4 shrink-0 text-graphite" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && matches.length > 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined}
          disabled={disabled}
          className="label-product-combobox-input h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-graphite/80 disabled:cursor-not-allowed disabled:opacity-50"
          value={open ? query : selected ? `${selected.sku} — ${selected.name}` : ''}
          placeholder={placeholder}
          onFocus={openList}
          onChange={(event) => {
            if (!open) setOpen(true);
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={placeholder}
          className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[3px] text-graphite transition-colors hover:bg-plate hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery('');
            } else {
              openList();
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div id={listboxId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-[3px] border border-rule bg-card py-1 shadow-lg">
          {matches.length > 0 ? matches.map((product, index) => (
            <div
              key={product.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={product.id === value}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${activeIndex === index ? 'bg-signal/10' : 'hover:bg-plate'}`}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(product);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-ink">{product.name}</span>
                <span className="tnum mt-0.5 block truncate text-[11px] text-graphite">
                  {product.sku}{product.barcode ? ` · ${product.barcode}` : ''}{product.isActive ? '' : ' · inactive'}
                </span>
              </span>
              {product.id === value && <Check aria-hidden="true" className="size-4 shrink-0 text-signal" />}
            </div>
          )) : (
            <p className="px-3 py-5 text-center text-[12px] text-graphite">{emptyMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
