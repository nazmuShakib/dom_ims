import type { Role } from '@/domain/types';

export const CAPABILITIES = [
  'VIEW_STOCK',
  'MOVE_STOCK',
  'REMOVE_STOCK',
  'VIEW_COSTS',
  'VIEW_REPORTS',
  'MANAGE_CATALOG',
  'CORRECT_STOCK',
  'MANAGE_USERS',
  'ARCHIVE_PRODUCTS',
  'VIEW_RMA',
  'CREATE_RMA',
  'MANAGE_RMA',
  'PRINT_LABELS',
  'REPRINT_NON_STOCK_LABELS',
  'CHECKOUT',
  'VIEW_INVOICES',
  'MANAGE_CUSTOMERS',
  'MANAGE_USED_DEVICES',
  'VIEW_EXPENSES',
  'MANAGE_EXPENSES',
  'VOID_EXPENSES',
  'VIEW_EMI',
  'RECORD_EMI_PAYMENT',
  'APPROVE_EMI_SETTLEMENT',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** PLAN.md §9.1. This is the canonical role matrix for every security boundary. */
export const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
  VIEW_STOCK: ['ADMIN', 'MANAGER', 'STAFF'],
  MOVE_STOCK: ['ADMIN', 'MANAGER', 'STAFF'],
  REMOVE_STOCK: ['ADMIN'],
  VIEW_COSTS: ['ADMIN', 'MANAGER'],
  VIEW_REPORTS: ['ADMIN', 'MANAGER'],
  MANAGE_CATALOG: ['ADMIN', 'MANAGER'],
  CORRECT_STOCK: ['ADMIN', 'MANAGER'],
  MANAGE_USERS: ['ADMIN'],
  ARCHIVE_PRODUCTS: ['ADMIN'],
  VIEW_RMA: ['ADMIN', 'MANAGER', 'STAFF'],
  CREATE_RMA: ['ADMIN', 'MANAGER', 'STAFF'],
  MANAGE_RMA: ['ADMIN', 'MANAGER'],
  PRINT_LABELS: ['ADMIN', 'MANAGER', 'STAFF'],
  REPRINT_NON_STOCK_LABELS: ['ADMIN', 'MANAGER'],
  CHECKOUT: ['ADMIN', 'MANAGER', 'STAFF'],
  VIEW_INVOICES: ['ADMIN', 'MANAGER', 'STAFF'],
  MANAGE_CUSTOMERS: ['ADMIN', 'MANAGER', 'STAFF'],
  MANAGE_USED_DEVICES: ['ADMIN', 'MANAGER'],
  VIEW_EXPENSES: ['ADMIN', 'MANAGER'],
  MANAGE_EXPENSES: ['ADMIN', 'MANAGER'],
  VOID_EXPENSES: ['ADMIN'],
  VIEW_EMI: ['ADMIN', 'MANAGER', 'STAFF'],
  RECORD_EMI_PAYMENT: ['ADMIN', 'MANAGER'],
  APPROVE_EMI_SETTLEMENT: ['ADMIN', 'MANAGER'],
};

export function hasPermission(role: Role, capability: Capability): boolean {
  return CAPABILITY_ROLES[capability].includes(role);
}

export function canSeeCosts(role: Role): boolean {
  return hasPermission(role, 'VIEW_COSTS');
}

export function canUseAccount(account: { isActive: boolean; banned: boolean }): boolean {
  return account.isActive && !account.banned;
}
