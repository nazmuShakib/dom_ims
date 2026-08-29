'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { SupplierEditor } from '@/components/suppliers/SupplierEditor';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button, Card, EmptyState, Field, Input, Select } from '@/components/ui';
import type { Supplier } from '@/domain/types';

type SupplierStatus = 'active' | 'removed' | 'all';
type SupplierOrder = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

export function SupplierRegister({
  suppliers,
  canManage,
}: {
  suppliers: Supplier[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SupplierStatus>('active');
  const [order, setOrder] = useState<SupplierOrder>('newest');

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return suppliers
      .filter((supplier) => {
        if (status === 'active' && !supplier.isActive) return false;
        if (status === 'removed' && supplier.isActive) return false;
        if (!term) return true;
        return [supplier.name, supplier.phone, supplier.email, supplier.address]
          .some((value) => value?.toLocaleLowerCase().includes(term));
      })
      .sort((a, b) => {
        if (order === 'newest') return b.createdAt.localeCompare(a.createdAt);
        if (order === 'oldest') return a.createdAt.localeCompare(b.createdAt);
        const names = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        return order === 'name-desc' ? -names : names;
      });
  }, [order, query, status, suppliers]);

  const reset = () => {
    setQuery('');
    setStatus('active');
    setOrder('newest');
  };

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('common.search')}>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('suppliers.searchPlaceholder')}
            />
          </Field>
          <Field label={t('common.status')}>
            <Select value={status} onChange={(event) => setStatus(event.target.value as SupplierStatus)}>
              <option value="active">{t('catalog.activeOnly')}</option>
              <option value="removed">{t('catalog.removedOnly')}</option>
              <option value="all">{t('catalog.allStatuses')}</option>
            </Select>
          </Field>
          <Field label={t('catalog.orderBy')}>
            <Select value={order} onChange={(event) => setOrder(event.target.value as SupplierOrder)}>
              <option value="newest">{t('catalog.newestCreated')}</option>
              <option value="oldest">{t('catalog.oldestCreated')}</option>
              <option value="name-asc">{t('catalog.nameAscending')}</option>
              <option value="name-desc">{t('catalog.nameDescending')}</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="tnum text-[12px] text-graphite">
            {t('suppliers.filteredCount', { shown: filtered.length, total: suppliers.length })}
          </p>
          <Button type="button" variant="ghost" onClick={reset}>{t('common.reset')}</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="max-h-[min(62dvh,40rem)] overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <EmptyState title={suppliers.length === 0 ? t('catalog.noSuppliers') : t('suppliers.noMatch')} />
          ) : (
            <ul>
              {filtered.map((supplier) => (
                <li
                  key={supplier.id}
                  className={`flex items-center justify-between gap-3 border-b border-rule-soft px-3 py-2 transition-colors last:border-0 hover:bg-signal-wash ${supplier.isActive ? '' : 'bg-plate/40'}`}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{canManage ? <Link className="text-signal hover:underline" href={`/suppliers/analytics/${supplier.id}`}>{supplier.name}</Link> : supplier.name}</p>
                    <p className="mt-0.5 break-words text-[12px] text-graphite">
                      <span className="tnum">{supplier.phone ?? '—'}</span>
                      {supplier.email && <> · {supplier.email}</>}
                      {supplier.address && <> · {supplier.address}</>}
                    </p>
                  </div>
                  {canManage && <SupplierEditor supplier={supplier} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}
