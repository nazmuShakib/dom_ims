import type { MessageKey } from '@/lib/i18n/messages';

const ENUM_KEYS: Record<string, MessageKey> = {
  IN_STOCK: 'enum.inStock', RESERVED: 'enum.reserved', SOLD: 'enum.sold', RETURNED: 'enum.returned',
  DAMAGED: 'enum.damaged', LOST: 'enum.lost', VOID: 'enum.void',
  CASH: 'enum.cash', CARD: 'enum.card', MOBILE_BANKING: 'enum.mobileBanking',
  BANK_TRANSFER: 'enum.bankTransfer', MIXED: 'enum.mixed', OTHER: 'enum.other',
  ACTIVE: 'common.active', VOIDED: 'expenses.voided',
  PAID: 'enum.paid', PARTIALLY_PAID: 'enum.partiallyPaid', UNPAID: 'enum.unpaid',
  SUBMITTED: 'enum.submitted', UNDER_INSPECTION: 'enum.underInspection', APPROVED: 'enum.approved',
  REJECTED: 'enum.rejected', SENT_FOR_REPAIR: 'enum.sentForRepair',
  READY_FOR_COLLECTION: 'enum.readyForCollection', REPLACED: 'enum.replaced',
  COMPLETED: 'enum.completed', CANCELLED: 'enum.cancelled',
  IN_WARRANTY: 'enum.inWarranty', OUT_OF_WARRANTY: 'enum.outOfWarranty',
  GOODWILL: 'enum.goodwill', UNKNOWN_PROOF_OF_PURCHASE: 'enum.unknownProof',
  WITH_CUSTOMER: 'enum.withCustomer', RECEIVED_BY_SHOP: 'enum.receivedByShop',
  WITH_TECHNICIAN: 'enum.withTechnician', SENT_TO_SUPPLIER: 'enum.sentToSupplier',
  RETURNED_TO_CUSTOMER: 'enum.returnedToCustomer', RETAINED_BY_SHOP: 'enum.retainedByShop',
  DRAFT: 'enum.draft', SENT: 'enum.sent', ACCEPTED: 'enum.accepted', REPAIRED: 'enum.repaired',
  CREDITED: 'enum.credited', CLOSED: 'enum.closed',
};

export function domainLabel(
  t: (key: MessageKey) => string,
  value: string,
): string {
  const key = ENUM_KEYS[value];
  return key ? t(key) : value.replaceAll('_', ' ').toLowerCase();
}
