import { ExpenseWorkspace } from '@/components/expenses/ExpenseWorkspace';
import { getSession, requirePageCapability } from '@/lib/session';
import { db } from '@/repositories';
import { listExpenses, parseExpenseQuery, summarizeExpenses } from '@/services/expenses';

export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requirePageCapability('VIEW_EXPENSES');
  const { role } = await getSession();
  const query = parseExpenseQuery(await searchParams);
  const [categories, expenses, users] = await Promise.all([
    db.expenseCategories.findAll(),
    listExpenses(query),
    db.users.findAll(),
  ]);

  return <ExpenseWorkspace
      role={role}
      query={query}
      expenses={expenses}
      categories={categories}
      users={users.map(({ id, name }) => ({ id, name }))}
      summary={summarizeExpenses(expenses, categories)}
      resultVersion={crypto.randomUUID()}
  />;
}
