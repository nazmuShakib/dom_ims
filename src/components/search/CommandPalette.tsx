'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, Search } from 'lucide-react';

import { formatBDT } from '@/lib/money';
import type { SearchResponse } from '@/lib/search';
import { ScannerInput } from '@/components/search/ScannerInput';
import { useI18n } from '@/components/i18n/I18nProvider';

const EMPTY: SearchResponse = { query: '', units: [], products: [] };

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        timeZone: 'Asia/Dhaka',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export function CommandPalette() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanRequest, setScanRequest] = useState(0);
  const immediateScan = useRef(false);
  const pendingScan = useRef<string | null>(null);
  const { t } = useI18n();

  const go = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    const delay = immediateScan.current ? 0 : 250;
    immediateScan.current = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const url = `/api/search?q=${encodeURIComponent(query.trim())}`;
        const request = () =>
          fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
          });

        let response = await request();
        // A sleeping Neon compute can make the first session read fail. Search
        // is read-only, so retry one server error instead of making the user type twice.
        if (response.status >= 500 && response.status <= 504) {
          await new Promise((resolve) => window.setTimeout(resolve, 300));
          if (controller.signal.aborted) return;
          response = await request();
        }
        if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired.' : 'Search failed.');
        const nextResults = (await response.json()) as SearchResponse;
        const scanned = pendingScan.current;
        if (scanned && scanned.toLowerCase() === query.trim().toLowerCase()) {
          pendingScan.current = null;
          const exactUnit = nextResults.units.find(
            (unit) => unit.serialNo.toLowerCase() === scanned.toLowerCase(),
          );
          if (exactUnit) {
            go(`/products/${exactUnit.productId}#unit-${exactUnit.id}`);
            return;
          }
          const exactProduct = nextResults.products.find((product) =>
            product.barcode?.toLowerCase() === scanned.toLowerCase()
              || product.sku.toLowerCase() === scanned.toLowerCase(),
          );
          if (exactProduct) {
            go(`/products/${exactProduct.id}`);
            return;
          }
        }
        setResults(nextResults);
      } catch (searchError) {
        if ((searchError as Error).name !== 'AbortError') {
          setResults(EMPTY);
          setError(searchError instanceof Error ? searchError.message : 'Search failed.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [go, open, query, scanRequest]);

  const retry = () => {
    immediateScan.current = true;
    setScanRequest((value) => value + 1);
  };

  const scan = (value: string) => {
    pendingScan.current = value.trim();
    immediateScan.current = true;
    setQuery(value);
    setScanRequest((current) => current + 1);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 min-w-0 max-w-xl flex-1 items-center justify-between rounded-[3px] border border-rule bg-plate/60 px-3 text-left text-[13px] text-graphite transition-colors hover:border-graphite/50 hover:bg-card"
        aria-label={t('search.open')}
      >
        <span className="truncate">{t('search.trigger')}</span>
        <kbd className="tnum ml-3 hidden shrink-0 rounded-[2px] border border-rule bg-card px-1.5 py-0.5 text-[10px] sm:inline">Ctrl/⌘ K</kbd>
      </button>

      {open && (
        <div
          data-scanner-blocking="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-2 pt-[7vh] sm:p-4 sm:pt-[10vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <Command
            shouldFilter={false}
            loop
            className="min-w-0 w-full max-w-2xl overflow-hidden rounded-[4px] border-2 border-sidebar-border bg-card shadow-2xl focus-visible:outline-none"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
          >
            <div className="border-b border-rule bg-plate/60 p-3">
              <div className="flex min-w-0 items-center rounded-[3px] border border-sidebar-border bg-card px-3">
                <Search aria-hidden="true" className="mr-2 size-4 shrink-0 text-graphite sm:mr-3" strokeWidth={2} />
                <ScannerInput
                  ref={inputRef}
                  value={query}
                  onValueChange={(value) => {
                    pendingScan.current = null;
                    setQuery(value);
                  }}
                  onScan={scan}
                  placeholder={t('search.placeholder')}
                  className="command-search-input h-11 min-w-0 w-full border-0 bg-transparent px-0 text-[14px] outline-none placeholder:text-graphite/80"
                />
                {loading && (
                  <span role="status" className="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-[3px] bg-plate px-2 py-1 text-[11px] font-medium text-graphite">
                    <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                    <span className="hidden sm:inline">{t('search.searchingShort')}</span>
                  </span>
                )}
              </div>
            </div>

            <Command.List className="min-h-36 max-h-[60vh] overflow-y-auto overscroll-contain p-2 focus-visible:outline-none">
              {query.trim().length < 2 && (
                <div className="px-3 py-10 text-center text-[12px] text-graphite">{t('search.minimum')}</div>
              )}
              {error && (
                <div className="flex flex-col items-center px-3 py-8 text-center text-[12px] text-out">
                  <p>{error}</p>
                  <button type="button" onClick={retry} className="mt-3 inline-flex items-center gap-1.5 rounded-[3px] border border-rule bg-card px-3 py-1.5 font-medium text-ink transition-colors hover:bg-plate">
                    <RefreshCw aria-hidden="true" className="size-3.5" />
                    {t('search.tryAgain')}
                  </button>
                </div>
              )}
              {!loading && !error && query.trim().length >= 2 && results.units.length === 0 && results.products.length === 0 && (
                <Command.Empty className="px-3 py-10 text-center text-[12px] text-graphite">{t('search.noMatching')}</Command.Empty>
              )}

              {results.units.length > 0 && (
                <Command.Group heading="Exact unit / IMEI" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2">
                  {results.units.map((unit) => (
                    <Command.Item
                      key={unit.id}
                      value={`unit-${unit.id}`}
                      onSelect={() => go(`/products/${unit.productId}#unit-${unit.id}`)}
                      className="flex min-w-0 cursor-pointer flex-col items-start gap-2 rounded-[3px] px-3 py-3 text-[13px] data-[selected=true]:bg-signal-wash data-[selected=true]:text-signal sm:flex-row sm:justify-between sm:gap-4"
                    >
                      <span className="min-w-0 max-w-full">
                        <span className="font-medium">{unit.productName}</span>
                        <span className="tnum mt-0.5 block break-all text-[11px] text-graphite">{unit.serialNo} · {unit.sku}</span>
                        <span className="mt-1 block break-words text-[11px] text-graphite">Received {date(unit.receivedAt)} · {unit.supplierName ?? 'Unknown supplier'} · {unit.soldAt ? `Sold ${date(unit.soldAt)}` : unit.status.replace('_', ' ')}</span>
                      </span>
                      <span className="shrink-0 text-left text-[11px] sm:text-right">
                        <span className={unit.underWarranty ? 'text-ok' : 'text-graphite'}>{unit.warrantyExpiresAt ? (unit.underWarranty ? `Warranty to ${date(unit.warrantyExpiresAt)}` : `Warranty ended ${date(unit.warrantyExpiresAt)}`) : 'No warranty date'}</span>
                        {unit.costPrice !== undefined && <span className="tnum mt-1 block text-graphite">Cost {formatBDT(unit.costPrice)}</span>}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {results.products.length > 0 && (
                <Command.Group heading="Products" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2">
                  {results.products.map((product) => (
                    <Command.Item
                      key={product.id}
                      value={`product-${product.id}`}
                      onSelect={() => go(`/products/${product.id}`)}
                      className="flex min-w-0 cursor-pointer flex-col items-start gap-2 rounded-[3px] px-3 py-3 text-[13px] data-[selected=true]:bg-signal-wash data-[selected=true]:text-signal sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <span className="min-w-0 max-w-full"><span className="font-medium">{product.name}</span>{!product.isActive && <span className="ml-2 text-[10px] font-semibold text-out">{t('search.inactive')}</span>}<span className="tnum mt-0.5 block break-all text-[11px] text-graphite">{product.sku}{product.model ? ` · ${product.model}` : ''}{product.barcode ? ` · ${product.barcode}` : ''}</span></span>
                      <span className={`tnum shrink-0 text-[11px] ${product.onHand > 0 ? 'text-graphite' : 'text-out'}`}>{product.onHand > 0 ? `${product.onHand} on hand` : 'Unavailable'}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>

            <div className="flex items-center justify-between border-t border-rule px-4 py-2 text-[10px] text-graphite">
              <span>{t('search.resultHint')}</span><span>{t('search.closeHint')}</span>
            </div>
          </Command>
        </div>
      )}
    </>
  );
}
