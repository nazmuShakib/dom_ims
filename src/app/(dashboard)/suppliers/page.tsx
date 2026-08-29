import { db } from '@/repositories';
import { createSupplier } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { SupplierRegister } from '@/components/suppliers/SupplierRegister';
import { PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const suppliers = await db.suppliers.findAll();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('nav.suppliers')}
        count={t('catalog.supplierCount', { count: suppliers.length })}
        action={role !== 'STAFF' ? (
          <span className="flex flex-wrap gap-2">
            <Link
              href="/suppliers/analytics"
              className="inline-flex h-9 items-center justify-center rounded-[3px] border border-graphite bg-graphite px-3.5 text-[13px] font-medium text-white transition-colors hover:border-ink hover:bg-ink"
            >
              {t('nav.supplierAnalytics')}
            </Link>
            <Link
              href="/suppliers/returns"
              className="inline-flex h-9 items-center justify-center rounded-[3px] border border-blue-700 bg-blue-700 px-3.5 text-[13px] font-medium text-white transition-colors hover:border-blue-800 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {t('nav.supplierReturns')}
            </Link>
          </span>
        ) : undefined}
      />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createSupplier}
          submitLabel={t('catalog.addSupplier')}
          fields={[
            { name: 'name', label: t('common.name'), placeholder: 'Dhaka Electronics Importers', required: true },
            { name: 'phone', label: t('customers.mobile'), type: 'tel', placeholder: '01712345678' },
            { name: 'email', label: t('common.email'), type: 'email', placeholder: 'sales@example.com' },
            { name: 'address', label: t('common.address'), placeholder: 'Motijheel, Dhaka' },
          ]}
        />
      </div>}

      <SupplierRegister suppliers={suppliers} canManage={role !== 'STAFF'} />
    </div>
  );
}
