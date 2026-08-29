'use client';

import Link from 'next/link';
import { useId } from 'react';
import { usePathname } from 'next/navigation';

export function NavLink({
  href,
  children,
  icon,
  onClick,
  tooltip,
  tooltipPlacement = 'bottom',
  exact = false,
  active: activeOverride,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  tooltip?: string;
  tooltipPlacement?: 'top' | 'bottom';
  exact?: boolean;
  active?: boolean;
}) {
  const pathname = usePathname();
  const tooltipId = useId();
  const routeIsActive = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  const active = activeOverride ?? routeIsActive;

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-describedby={tooltip ? tooltipId : undefined}
      className={`group relative mb-0.5 flex items-center gap-1 rounded-[3px] border px-1.5 py-1 text-[14px] transition-[background-color,border-color,color,box-shadow] ${
        active
          ? 'border-sidebar-active-border bg-sidebar-active font-semibold text-sidebar-active-text shadow-[inset_0_0_0_1px_rgba(46,75,216,0.08)]'
          : 'border-transparent text-sidebar-text hover:border-sidebar-border hover:bg-sidebar-hover hover:text-ink'
      }`}
    >
      {active && (
        <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-r-full bg-signal" />
      )}
      {icon}
      <span className="min-w-0">{children}</span>
      {tooltip && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute right-2 left-2 z-[80] invisible rounded-[3px] bg-ink px-2.5 py-2 text-left text-[11px] font-normal leading-[1.4] text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-hover:delay-[350ms] group-focus-visible:visible group-focus-visible:opacity-100 group-focus-visible:delay-[350ms] ${
            tooltipPlacement === 'top'
              ? 'bottom-[calc(100%+2px)]'
              : 'top-[calc(100%+2px)]'
          }`}
        >
          {tooltip}
        </span>
      )}
    </Link>
  );
}
