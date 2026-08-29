'use client';

import type { Role } from '@/domain/types';
import { NavLink } from '@/components/shell/NavLink';
import { useI18n } from '@/components/i18n/I18nProvider';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  ClipboardCheck,
  FolderTree,
  LayoutDashboard,
  Package,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Tags,
  Truck,
  Undo2,
  UserCog,
  UsersRound,
  WalletCards,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';

export function NavigationLinks({
  role,
  onNavigate,
  desktop = false,
}: {
  role: Role;
  onNavigate?: () => void;
  desktop?: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPreparingCheckoutTradeIn =
    pathname === '/stock/used-intake' && Boolean(searchParams.get('cart'));
  const icon = (Icon: LucideIcon) => (
    <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={2.1} />
  );
  const catalog = [
    { href: '/products', label: t('common.products'), icon: Package },
    { href: '/categories', label: t('nav.categories'), icon: FolderTree },
    { href: '/brands', label: t('nav.brands'), icon: BadgeCheck },
  ];
  return (
    <div className={`navigation-links ${desktop ? 'desktop-navigation' : ''}`}>
      <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.overview')}</p>
      <NavLink href="/" onClick={onNavigate} icon={icon(LayoutDashboard)}>{t('nav.dashboard')}</NavLink>

      <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.sales')}</p>
      <NavLink href="/checkout" active={isPreparingCheckoutTradeIn ? true : undefined} onClick={onNavigate} icon={icon(ShoppingCart)}>{t('nav.checkout')}</NavLink>
      <NavLink href="/invoices" onClick={onNavigate} icon={icon(ReceiptText)}>{t('nav.invoices')}</NavLink>
      <NavLink href="/emi" onClick={onNavigate} icon={icon(CalendarClock)}>{t('nav.emi')}</NavLink>
      <NavLink href="/customers" onClick={onNavigate} icon={icon(UsersRound)}>{t('nav.customers')}</NavLink>

      <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.stock')}</p>
      <NavLink href="/stock/in" onClick={onNavigate} icon={icon(PackagePlus)}>{t('nav.receiveStock')}</NavLink>
      {role !== 'STAFF' && <NavLink href="/stock/used-intake" active={isPreparingCheckoutTradeIn ? false : undefined} onClick={onNavigate} icon={icon(Smartphone)}>{t('nav.usedPhoneIntake')}</NavLink>}
      <NavLink href="/stock/labels" onClick={onNavigate} icon={icon(Tags)}>{t('nav.printLabels')}</NavLink>
      {role === 'ADMIN' && <NavLink href="/stock/out" onClick={onNavigate} icon={icon(PackageMinus)}>{t('nav.removeStock')}</NavLink>}

      <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.catalog')}</p>
      {catalog.map((item) => (
        <NavLink key={item.href} href={item.href} onClick={onNavigate} icon={icon(item.icon)}>
          {item.label}
        </NavLink>
      ))}

      <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.suppliers')}</p>
      <NavLink href="/suppliers" exact onClick={onNavigate} icon={icon(Truck)}>{t('nav.supplierList')}</NavLink>
      {role !== 'STAFF' && <NavLink href="/suppliers/returns" onClick={onNavigate} icon={icon(Undo2)}>{t('nav.supplierReturns')}</NavLink>}
      {role !== 'STAFF' && <NavLink href="/suppliers/analytics" onClick={onNavigate} icon={icon(TrendingUp)}>{t('nav.supplierAnalytics')}</NavLink>}

      <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.inventoryRecords')}</p>
      <NavLink href="/stock/movements" onClick={onNavigate} icon={icon(ArrowLeftRight)} tooltip={desktop ? t('navHelp.movementLedger') : undefined}>{t('nav.movementLedger')}</NavLink>
      {role !== 'STAFF' && <NavLink href="/stock/reconcile" onClick={onNavigate} icon={icon(ClipboardCheck)} tooltip={desktop ? t('navHelp.reconciliation') : undefined}>{t('nav.reconciliation')}</NavLink>}

      {role !== 'STAFF' && (
        <>
          <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.analysis')}</p>
          <NavLink href="/expenses" onClick={onNavigate} icon={icon(WalletCards)}>{t('nav.expenses')}</NavLink>
          <NavLink href="/reports" onClick={onNavigate} icon={icon(BarChart3)} tooltip={desktop ? t('navHelp.reports') : undefined}>{t('nav.reports')}</NavLink>
        </>
      )}

      <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.afterSales')}</p>
      <NavLink href="/warranty" onClick={onNavigate} icon={icon(ShieldCheck)} tooltip={desktop ? t('navHelp.warrantyClaims') : undefined}>{t('nav.warrantyClaims')}</NavLink>

      {role === 'ADMIN' && (
        <>
          <p className="sidebar-section-label eyebrow px-2 pb-1">{t('shell.administration')}</p>
          <NavLink href="/users" onClick={onNavigate} icon={icon(UserCog)}>{t('nav.users')}</NavLink>
          <NavLink href="/audit" onClick={onNavigate} icon={icon(ScrollText)} tooltip={desktop ? t('navHelp.auditLog') : undefined} tooltipPlacement="top">{t('nav.auditLog')}</NavLink>
        </>
      )}

      <p className="sidebar-section-label eyebrow px-2 pb-1">{t('settings.title')}</p>
      <NavLink href="/settings" onClick={onNavigate} icon={icon(Settings)}>{t('nav.settings')}</NavLink>
    </div>
  );
}
