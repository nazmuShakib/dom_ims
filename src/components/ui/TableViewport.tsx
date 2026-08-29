'use client';

import type { PointerEvent, ReactNode } from 'react';

export function TableViewport({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  function showScrollbar(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.classList.add('scrollbar-active');
  }

  function hideScrollbar(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.classList.remove('scrollbar-active');
  }

  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Scrollable table"
      onPointerEnter={showScrollbar}
      onPointerLeave={hideScrollbar}
      className={`contextual-scroll-area max-h-[min(65vh,42rem)] overflow-auto overscroll-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${className}`}
    >
      {children}
    </div>
  );
}
