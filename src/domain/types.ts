import type { Paisa } from '@/lib/money';

/**
 * These mirror prisma/schema.prisma exactly (PLAN.md §6). When the Prisma client
 * is generated in Phase 1, these can be replaced by its generated types — but the
 * shapes must stay identical, or the repository swap stops being a one-liner.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const TRACKING_TYPES = ['SERIAL', 'QUANTITY'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const UNIT_STATUSES = [
  'IN_STOCK',
  'RESERVED',
  'SOLD',
  'RETURNED',
  'DAMAGED',
  'LOST',
  /** Created in error and reversed out. Never counted as stock, never as a sale. */
  'VOID',
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_REASONS = [
  'INITIAL_STOCK',
  'PURCHASE',
  'TRADE_IN',
  'CUSTOMER_RETURN',
  'SALE',
  'RETURN_TO_SUPPLIER',
  'DAMAGE',
  'LOSS',
  'INTERNAL_USE',
  'SHOP_USE',
  'GIFT',
  'WARRANTY_REPLACEMENT',
  'CORRECTION',
  'STOCK_COUNT',
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Which reasons put stock IN vs take it OUT. The sign of `quantity` follows from this. */
export const INBOUND_REASONS: readonly MovementReason[] = [
  'INITIAL_STOCK',
  'PURCHASE',
  'TRADE_IN',
  'CUSTOMER_RETURN',
];
export const OUTBOUND_REASONS: readonly MovementReason[] = [
  'SALE',
  'RETURN_TO_SUPPLIER',
  'DAMAGE',
  'LOSS',
  'INTERNAL_USE',
  'SHOP_USE',
  'GIFT',
  'WARRANTY_REPLACEMENT',
];

/** Where a unit ends up after an outbound movement. */
export const OUTBOUND_UNIT_STATUS: Record<string, UnitStatus> = {
  SALE: 'SOLD',
  DAMAGE: 'DAMAGED',
  LOSS: 'LOST',
  RETURN_TO_SUPPLIER: 'RETURNED',
  INTERNAL_USE: 'SOLD',
  SHOP_USE: 'SOLD',
  GIFT: 'SOLD',
  WARRANTY_REPLACEMENT: 'SOLD',
};

export const RMA_STATUSES = ['SUBMITTED', 'UNDER_INSPECTION', 'APPROVED', 'REJECTED', 'SENT_FOR_REPAIR', 'READY_FOR_COLLECTION', 'REPLACED', 'COMPLETED', 'CANCELLED'] as const;
export type RmaStatus = (typeof RMA_STATUSES)[number];
/** Ordinary claim transitions. REPLACED is deliberately absent: only the
 * transactional replacement resolution may produce it. */
export const RMA_STATUS_TRANSITIONS: Record<RmaStatus, readonly RmaStatus[]> = {
  SUBMITTED: ['UNDER_INSPECTION', 'CANCELLED'],
  UNDER_INSPECTION: ['APPROVED', 'REJECTED', 'SENT_FOR_REPAIR', 'CANCELLED'],
  APPROVED: ['SENT_FOR_REPAIR', 'READY_FOR_COLLECTION', 'COMPLETED'],
  REJECTED: ['COMPLETED'],
  SENT_FOR_REPAIR: ['READY_FOR_COLLECTION', 'REJECTED'],
  READY_FOR_COLLECTION: ['COMPLETED'],
  REPLACED: [],
  COMPLETED: [],
  CANCELLED: [],
};
export const RMA_COVERAGES = ['IN_WARRANTY', 'OUT_OF_WARRANTY', 'GOODWILL', 'UNKNOWN_PROOF_OF_PURCHASE'] as const;
export type RmaCoverage = (typeof RMA_COVERAGES)[number];
export const RMA_CUSTODIES = ['WITH_CUSTOMER', 'RECEIVED_BY_SHOP', 'WITH_TECHNICIAN', 'SENT_TO_SUPPLIER', 'READY_FOR_COLLECTION', 'RETURNED_TO_CUSTOMER', 'RETAINED_BY_SHOP'] as const;
export type RmaCustody = (typeof RMA_CUSTODIES)[number];
export const SUPPLIER_WARRANTY_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'REPAIRED', 'REPLACED', 'CREDITED', 'RETURNED', 'CLOSED'] as const;
export type SupplierWarrantyStatus = (typeof SUPPLIER_WARRANTY_STATUSES)[number];

export const SUPPLIER_RETURN_STATUSES = ['PENDING', 'SETTLED', 'CANCELLED'] as const;
export type SupplierReturnStatus = (typeof SUPPLIER_RETURN_STATUSES)[number];
export const SUPPLIER_RETURN_REASONS = ['SLOW_MOVING', 'EXCESS_STOCK', 'WRONG_ITEM', 'DEFECTIVE', 'RECALL', 'OTHER'] as const;
export type SupplierReturnReason = (typeof SUPPLIER_RETURN_REASONS)[number];
export const SUPPLIER_RECOVERY_METHODS = ['CASH', 'MOBILE_BANKING', 'BANK_TRANSFER', 'SUPPLIER_CREDIT', 'MIXED', 'OTHER', 'NO_RECOVERY'] as const;
export type SupplierRecoveryMethod = (typeof SUPPLIER_RECOVERY_METHODS)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'MOBILE_BANKING', 'BANK_TRANSFER', 'MIXED', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_STATUSES = ['PAID', 'PARTIALLY_PAID', 'UNPAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type SaleStatus = 'COMPLETED' | 'VOIDED';
export const SALE_SETTLEMENT_TYPES = ['CUSTOMER_COLLECTION', 'TRADE_IN_PAYOUT'] as const;
export type SaleSettlementType = (typeof SALE_SETTLEMENT_TYPES)[number];

export const CUSTOMER_IDENTIFICATION_TYPES = ['NID', 'PASSPORT', 'BIRTH_CERTIFICATE'] as const;
export type CustomerIdentificationType = (typeof CUSTOMER_IDENTIFICATION_TYPES)[number];
export const EMI_TERMS = [3, 6, 9, 12] as const;
export type EmiTerm = (typeof EMI_TERMS)[number];
export type EmiContractStatus = 'ACTIVE' | 'PAID' | 'OVERDUE' | 'VOIDED';
export type EmiInstallmentStatus = 'UPCOMING' | 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOIDED';
export type EmiPaymentStatus = 'ACTIVE' | 'REVERSED';

export const OPERATING_EXPENSE_STATUSES = ['ACTIVE', 'VOIDED'] as const;
export type OperatingExpenseStatus = (typeof OPERATING_EXPENSE_STATUSES)[number];

export const USED_DEVICE_GRADES = ['GRADE_A', 'GRADE_B', 'GRADE_C', 'REFURBISHED'] as const;
export type UsedDeviceGrade = (typeof USED_DEVICE_GRADES)[number];
export const USED_ACQUISITION_TYPES = ['DIRECT_PURCHASE', 'TRADE_IN'] as const;
export type UsedAcquisitionType = (typeof USED_ACQUISITION_TYPES)[number];
export const INSPECTION_RESULTS = ['WORKING', 'DEFECTIVE', 'NOT_TESTED', 'NOT_APPLICABLE'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];
export type UsedDeviceInspection = Record<string, InspectionResult>;

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  image: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string; // ISO-8601 UTC
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  model: string | null;
  trackingType: TrackingType;
  categoryId: string;
  brandId: string | null;
  defaultCostPrice: Paisa;
  defaultSalePrice: Paisa;
  /** Maximum reduction from list price that STAFF may apply per unit. */
  staffMaxDiscount: Paisa;
  taxRate: number; // basis points; unused in v1
  reorderPoint: number;
  /** CACHE. Authoritative only for trackingType = QUANTITY. See PLAN.md §5.2. */
  quantityOnHand: number;
  /** Maintained only for trackingType = QUANTITY. */
  avgCostPrice: Paisa;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductUnit {
  id: string;
  serialNo: string;
  productId: string;
  status: UnitStatus;
  costPrice: Paisa;
  salePrice: Paisa | null;
  supplierId: string | null;
  receivedAt: string;
  soldAt: string | null;
  warrantyMonths: number | null;
  warrantyDays?: number | null;
  warrantyExpiresAt: string | null;
  location: string | null;
  note: string | null;
  usedGrade: UsedDeviceGrade | null;
  batteryHealth: number | null;
  inspectionResults: UsedDeviceInspection | null;
  knownDefects: string | null;
  includedAccessories: string | null;
  askingPrice: Paisa | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  type: MovementType;
  reason: MovementReason;
  productId: string;
  unitId: string | null;
  /** SIGNED. Positive = into stock, negative = out. Never zero. PLAN.md §5.1. */
  quantity: number;
  unitCost: Paisa;
  unitPrice: Paisa | null;
  supplierId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  reference: string | null;
  note: string | null;
  actorId: string | null;
  idempotencyKey: string | null;
  reversesId: string | null;
  warrantyClaimId?: string | null;
  createdAt: string;
  /** NOTE: no updatedAt. Append-only. */
}

export interface WarrantyClaim {
  id: string;
  claimNumber: string;
  idempotencyKey: string;
  unitId: string;
  saleMovementId: string;
  claimantName: string | null;
  claimantPhone: string | null;
  reportedIssue: string;
  physicalCondition: string | null;
  status: RmaStatus;
  coverage: RmaCoverage;
  custody: RmaCustody;
  resolution: string | null;
  openedById: string;
  assignedToId: string | null;
  openedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface WarrantyClaimEvent {
  id: string;
  claimId: string;
  eventType: string;
  idempotencyKey: string;
  fromStatus: RmaStatus | null;
  toStatus: RmaStatus | null;
  fromCustody: RmaCustody | null;
  toCustody: RmaCustody | null;
  note: string | null;
  actorId: string;
  createdAt: string;
}

export interface SupplierWarrantyCase {
  id: string;
  claimId: string;
  supplierId: string;
  reference: string | null;
  status: SupplierWarrantyStatus;
  coverage: RmaCoverage;
  resolution: string | null;
  sentAt: string | null;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierReturn {
  id: string;
  returnNumber: string;
  movementId: string;
  supplierId: string;
  reason: SupplierReturnReason;
  status: SupplierReturnStatus;
  recoveredAmount: Paisa | null;
  recoveryMethod: SupplierRecoveryMethod | null;
  settlementReference: string | null;
  settlementNote: string | null;
  createdById: string;
  settledById: string | null;
  sentAt: string;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  phoneNormalized: string | null;
  identificationType?: CustomerIdentificationType | null;
  identificationNumber?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartDraft {
  id: string;
  actorId: string;
  tradeInDraft: TradeInCartDraft | null;
  createdAt: string;
  updatedAt: string;
}

/** Provisional incoming phone. It becomes inventory only when checkout commits. */
export interface TradeInCartDraft {
  productId: string;
  serialNo: string;
  grade: UsedDeviceGrade;
  batteryHealth: number | null;
  inspectionResults: Record<string, InspectionResult>;
  knownDefects: string | null;
  includedAccessories: string | null;
  askingPrice: Paisa;
  warrantyMonths: number | null;
  warrantyDays: number | null;
  location: string | null;
  sellerName: string;
  sellerPhone: string;
  identificationType: string | null;
  identificationNumber: string | null;
  acquisitionValue: Paisa;
  reference: string | null;
  note: string | null;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  idempotencyKey: string;
  checkoutCartId: string | null;
  status: SaleStatus;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  actorId: string;
  actorName: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: Paisa;
  reference: string | null;
  note: string | null;
  subtotal: Paisa;
  discount: Paisa;
  total: Paisa;
  tradeInCredit: Paisa;
  tradeInDetails: TradeInSaleSnapshot | null;
  completedAt: string;
  createdAt: string;
  voidedAt: string | null;
  voidedById: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  refundAmount: Paisa | null;
  refundMethod: PaymentMethod | null;
  voidIdempotencyKey: string | null;
}

export interface SaleSettlement {
  id: string;
  receiptNumber: string;
  idempotencyKey: string;
  saleId: string;
  type: SaleSettlementType;
  amount: Paisa;
  paymentMethod: PaymentMethod;
  reference: string | null;
  note: string | null;
  recordedById: string;
  recordedByName: string;
  recordedAt: string;
  createdAt: string;
}

/** Immutable incoming-device summary printed with a completed trade-in sale. */
export interface TradeInSaleSnapshot {
  productName: string;
  sku: string;
  serialNo: string;
  grade: UsedDeviceGrade;
  acquisitionValue: Paisa;
}

export interface SaleItem {
  id: string;
  saleId: string;
  movementId: string;
  productName: string;
  sku: string;
  serialNo: string | null;
  listUnitPrice: Paisa;
  warrantyMonths: number | null;
  warrantyDays?: number | null;
  usedGrade: UsedDeviceGrade | null;
  knownDefects: string | null;
  position: number;
  createdAt: string;
}

export interface EmiContract {
  id: string;
  contractNumber: string;
  saleId: string;
  customerId: string;
  status: EmiContractStatus;
  termMonths: EmiTerm;
  normalPrice: Paisa;
  emiTotal: Paisa;
  downPayment: Paisa;
  tradeInCredit: Paisa;
  financedAmount: Paisa;
  firstDueDate: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  voidedAt: string | null;
}

export interface EmiInstallment {
  id: string;
  contractId: string;
  sequence: number;
  dueDate: string;
  amountDue: Paisa;
  amountPaid: Paisa;
  status: EmiInstallmentStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmiPayment {
  id: string;
  receiptNumber: string;
  idempotencyKey: string;
  contractId: string;
  amount: Paisa;
  paymentMethod: PaymentMethod;
  reference: string | null;
  note: string | null;
  status: EmiPaymentStatus;
  recordedById: string;
  recordedByName: string;
  paidAt: string;
  reversedAt: string | null;
  reverseReason: string | null;
  createdAt: string;
}

export interface EmiPaymentAllocation {
  id: string;
  paymentId: string;
  installmentId: string;
  amount: Paisa;
  createdAt: string;
}

export interface EmiEarlySettlement {
  id: string;
  contractId: string;
  outstandingBefore: Paisa;
  discountAmount: Paisa;
  finalAmount: Paisa;
  reason: string;
  approvedById: string;
  approvedByName: string;
  approvedAt: string;
}

/** Read model: immutable invoice snapshot plus economics from its linked movement. */
export interface InvoiceItem extends SaleItem {
  quantity: number;
  actualUnitPrice: Paisa;
  discount: Paisa;
  lineTotal: Paisa;
}

export interface UsedDeviceAcquisition {
  id: string;
  idempotencyKey: string;
  unitId: string;
  type: UsedAcquisitionType;
  sellerName: string;
  sellerPhone: string;
  identificationType: string | null;
  identificationNumber: string | null;
  acquisitionValue: Paisa;
  ownershipConfirmed: boolean;
  acceptedById: string;
  reference: string | null;
  note: string | null;
  acquiredAt: string;
  createdAt: string;
  tradeInSaleId: string | null;
}

export interface RefurbishmentExpense {
  id: string;
  unitId: string;
  description: string;
  amount: Paisa;
  actorId: string;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OperatingExpense {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  categoryId: string;
  description: string;
  amount: Paisa;
  paidTo: string | null;
  paymentMethod: PaymentMethod;
  reference: string | null;
  note: string | null;
  status: OperatingExpenseStatus;
  recordedById: string;
  updatedById: string;
  voidedById: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
}
