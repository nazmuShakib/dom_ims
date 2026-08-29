import { CreateCustomerForm } from '@/components/customers/CreateCustomerForm';
import { CustomerRegister } from '@/components/customers/CustomerRegister';
import { Card, PageHeader } from '@/components/ui';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePageCapability('MANAGE_CUSTOMERS');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const { q = '' } = await searchParams;
  const customers = q.trim()
    ? await db.customers.search(q, 100)
    : await db.customers.findAll();
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('customers.title')}
        count={t('customers.summary', {
          count: customers.length,
          kind: t(q ? 'customers.matching' : 'customers.reusable'),
        })}
      />
      <Card className="mb-4 p-5 sm:p-6">
        <p className="eyebrow mb-4">{t('customers.new')}</p>
        <CreateCustomerForm />
      </Card>
      <CustomerRegister
        confirmedQuery={q}
        customers={customers}
        resultVersion={crypto.randomUUID()}
      />
    </div>
  );
}
