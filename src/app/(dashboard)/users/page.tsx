import { changeUserRole, toggleUserActive } from '@/actions/users';
import { CreateUserForm } from '@/components/auth/CreateUserForm';
import { AdminPasswordReset, UserPhoneEditor } from '@/components/auth/UserSecurityControls';
import { Badge, Button, Card, PageHeader, Select, TableViewport } from '@/components/ui';
import { prisma } from '@/lib/prisma';
import { getSession, requirePageRole } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const current = await requirePageRole('ADMIN');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const users = await prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });

  return (
    <>
      <PageHeader title={t('nav.users')} count={t('users.accounts', { count: users.length })} />
      <CreateUserForm />
      <Card>
        <TableViewport>
          <table className="w-full">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-rule">
              <th className="eyebrow px-4 py-2.5 text-left">{t('users.user')}</th>
              <th className="eyebrow px-4 py-2.5 text-left">{t('customers.mobile')}</th>
              <th className="eyebrow px-4 py-2.5 text-left">{t('users.role')}</th>
              <th className="eyebrow px-4 py-2.5 text-left">{t('common.status')}</th>
              <th className="eyebrow px-4 py-2.5 text-right">{t('users.action')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-rule-soft last:border-0">
                <td className="px-4 py-3">
                  <p className="text-[13px] font-medium">{user.name}</p>
                </td>
                <td className="px-4 py-3">
                  <UserPhoneEditor userId={user.id} phone={user.phoneNumber} />
                </td>
                <td className="px-4 py-3">
                  {user.id === current.id ? (
                    <Badge tone="signal">{user.role}</Badge>
                  ) : (
                    <form action={changeUserRole} className="flex gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <Select
                        key={user.role}
                        name="role"
                        defaultValue={user.role}
                        className="max-w-32"
                      >
                        <option value="STAFF">{t('users.staff')}</option>
                        <option value="MANAGER">{t('users.manager')}</option>
                        <option value="ADMIN">{t('users.admin')}</option>
                      </Select>
                      <Button type="submit" variant="ghost">{t('common.save')}</Button>
                    </form>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={user.isActive ? 'ok' : 'out'}>
                    {user.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {user.id !== current.id && (
                    <div className="flex justify-end gap-2">
                      <AdminPasswordReset userId={user.id} userName={user.name} />
                      <form action={toggleUserActive}>
                        <input type="hidden" name="userId" value={user.id} />
                        <Button type="submit" variant={user.isActive ? 'danger' : 'ghost'}>
                          {user.isActive ? t('users.deactivate') : t('users.activate')}
                        </Button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </TableViewport>
      </Card>
    </>
  );
}
