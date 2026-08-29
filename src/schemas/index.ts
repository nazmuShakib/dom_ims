import { z } from 'zod';
import {
  ROLES,
  TRACKING_TYPES,
  UNIT_STATUSES,
  MOVEMENT_REASONS,
  RMA_STATUSES,
  RMA_CUSTODIES,
  RMA_COVERAGES,
  SUPPLIER_WARRANTY_STATUSES,
  SUPPLIER_RECOVERY_METHODS,
  SUPPLIER_RETURN_REASONS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  USED_DEVICE_GRADES,
  USED_ACQUISITION_TYPES,
  INSPECTION_RESULTS,
  CUSTOMER_IDENTIFICATION_TYPES,
  EMI_TERMS,
} from '@/domain/types';
import { isBangladeshMobile } from '@/lib/phone';
import { parseBDT } from '@/lib/money';

/**
 * ONE schema per input, shared by the client form (react-hook-form) and the
 * server action. Define once, import both places. PLAN.md §3.
 */

const paisa = z
  .number()
  .int('Money must be an integer number of paisa — never a float')
  .nonnegative();

const optionalFormText = (maximum: number) => z.union([
  z.string().trim().max(maximum).transform((value) => value || null),
  z.null(),
]);
const expenseAmountInput = z.union([
  z.string().trim()
    .min(1, 'Enter the expense amount.')
    .refine((value) => {
      if (!/^(?:৳\s*)?\d[\d,]*(?:\.\d{1,2})?$/.test(value)) return false;
      try { return parseBDT(value) > 0; } catch { return false; }
    }, 'Enter a valid amount greater than zero.')
    .transform((value) => parseBDT(value)),
  paisa.positive('Enter an amount greater than zero.'),
]);
const expenseDateInput = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid expense date.');

export const createProductSchema = z
  .object({
    sku: z.string().min(1).max(64).trim(),
    barcode: z.string().trim().optional().nullable(),
    name: z.string().min(1).max(200).trim(),
    description: z.string().max(2000).optional().nullable(),
    model: z.string().max(120).optional().nullable(),
    trackingType: z.enum(TRACKING_TYPES).default('SERIAL'),
    categoryId: z.string().uuid(),
    brandId: z.string().uuid().optional().nullable(),
    defaultCostPrice: paisa.default(0),
    defaultSalePrice: paisa.default(0),
    staffMaxDiscount: paisa.nonnegative().default(0),
    taxRate: z.number().int().min(0).max(10_000).default(0), // basis points
    reorderPoint: z.number().int().nonnegative().default(5),
    imageUrl: z.string().url().optional().nullable(),
  })
  .refine((p) => p.defaultSalePrice === 0 || p.defaultSalePrice >= p.defaultCostPrice, {
    message: 'Selling price is below cost price — is that intentional?',
    path: ['defaultSalePrice'],
  })
  .refine((p) => p.staffMaxDiscount <= p.defaultSalePrice, {
    message: 'The STAFF discount cannot exceed this product’s selling price.',
    path: ['staffMaxDiscount'],
  });
export type CreateProductInput = z.input<typeof createProductSchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  parentId: z.string().uuid().optional().nullable(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createBrandSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(150).trim(),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine(
      isBangladeshMobile,
      'Enter a valid Bangladeshi mobile number, such as 01712345678 or +8801712345678.',
    )
    .optional()
    .nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

/**
 * STOCK IN.
 * SERIAL products take a list of serials (one unit each).
 * QUANTITY products take a count.
 */
export const receiveStockSchema = z
  .object({
    productId: z.string().uuid(),
    supplierId: z.string().uuid().optional().nullable(),
    unitCost: paisa,
    reason: z.enum(['PURCHASE', 'INITIAL_STOCK', 'CUSTOMER_RETURN']).default('PURCHASE'),

    // SERIAL path
    serialNumbers: z.array(z.string().min(1).max(120).trim()).optional(),
    warrantyMonths: z.number().int().min(0).max(120).optional().nullable(),
    warrantyDays: z.number().int().min(0).max(3650).optional().nullable(),
    unitCondition: z.enum(['NEW', 'REFURBISHED']).default('NEW'),
    location: z.string().max(100).optional().nullable(),

    // QUANTITY path
    quantity: z.number().int().positive().optional(),

    reference: z.string().max(100).optional().nullable(),
    note: z.string().max(1000).optional().nullable(),
    actorId: z.string(),
    idempotencyKey: z.string().min(8),
  })
  .refine((i) => Boolean(i.serialNumbers?.length) !== Boolean(i.quantity), {
    message: 'Provide device numbers/IMEIs for individually tracked products or a quantity for bulk/count-based products.',
  })
  .refine(
    (i) => !i.serialNumbers || new Set(i.serialNumbers).size === i.serialNumbers.length,
    { message: 'Duplicate serial numbers in this batch', path: ['serialNumbers'] },
  )
  .refine(
    (i) => i.warrantyMonths == null || i.warrantyDays == null,
    { message: 'Choose either days or months for the warranty.', path: ['warrantyDays'] },
  );
export type ReceiveStockInput = z.input<typeof receiveStockSchema>;

const inspectionResult = z.enum(INSPECTION_RESULTS);
export const usedDeviceInspectionSchema = z.object({
  imeiMatches: inspectionResult,
  activationLockClear: inspectionResult,
  networkAndSim: inspectionResult,
  wifi: inspectionResult,
  bluetooth: inspectionResult,
  display: inspectionResult,
  touchscreen: inspectionResult,
  cameras: inspectionResult,
  microphone: inspectionResult,
  speakers: inspectionResult,
  chargingPort: inspectionResult,
  buttons: inspectionResult,
  biometrics: inspectionResult,
  frameAndBack: inspectionResult,
  waterDamageFree: inspectionResult,
  battery: inspectionResult,
});

export const acceptUsedDeviceSchema = z.object({
  productId: z.string().uuid(),
  serialNo: z.string().trim().min(1).max(120),
  grade: z.enum(USED_DEVICE_GRADES),
  batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
  inspectionResults: usedDeviceInspectionSchema,
  knownDefects: z.string().trim().max(2000).optional().nullable(),
  includedAccessories: z.string().trim().max(1000).optional().nullable(),
  askingPrice: paisa,
  warrantyMonths: z.number().int().min(0).max(120).optional().nullable(),
  warrantyDays: z.number().int().min(0).max(3650).optional().nullable(),
  location: z.string().trim().max(100).optional().nullable(),
  acquisitionType: z.enum(USED_ACQUISITION_TYPES),
  sellerName: z.string().trim().min(1).max(150),
  sellerPhone: z.string().trim().max(30).refine(
    isBangladeshMobile,
    'Enter a valid Bangladeshi mobile number, such as 01712345678 or +8801712345678.',
  ),
  identificationType: z.string().trim().max(100).optional().nullable(),
  identificationNumber: z.string().trim().max(150).optional().nullable(),
  acquisitionValue: paisa,
  ownershipConfirmed: z.literal(true, 'Confirm that the seller owns the device.'),
  reference: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
}).superRefine((input, context) => {
  if (input.warrantyMonths != null && input.warrantyDays != null) {
    context.addIssue({ code: 'custom', path: ['warrantyDays'], message: 'Choose either days or months for the warranty.' });
  }
  if (input.inspectionResults.imeiMatches !== 'WORKING') {
    context.addIssue({ code: 'custom', path: ['inspectionResults', 'imeiMatches'], message: 'The IMEI must match the device before acceptance.' });
  }
  if (input.inspectionResults.activationLockClear !== 'WORKING') {
    context.addIssue({ code: 'custom', path: ['inspectionResults', 'activationLockClear'], message: 'Remove all account and activation locks before acceptance.' });
  }
  if (
    Object.values(input.inspectionResults).includes('DEFECTIVE')
    && !input.knownDefects
  ) {
    context.addIssue({ code: 'custom', path: ['knownDefects'], message: 'Describe every defective inspection result before acceptance.' });
  }
  if ((input.grade === 'GRADE_C' || input.grade === 'REFURBISHED') && !input.knownDefects) {
    context.addIssue({ code: 'custom', path: ['knownDefects'], message: 'Grade C and refurbished phones require a defect or repair-history note.' });
  }
});
export type AcceptUsedDeviceInput = z.infer<typeof acceptUsedDeviceSchema>;

export const refurbishmentExpenseSchema = z.object({
  unitId: z.string().uuid(),
  description: z.string().trim().min(2).max(500),
  amount: paisa.refine((value) => value > 0, 'Expense must be greater than zero.'),
  actorId: z.string().min(1),
});
export type RefurbishmentExpenseInput = z.infer<typeof refurbishmentExpenseSchema>;

export const updateUsedDeviceSchema = z.object({
  unitId: z.string().uuid(),
  grade: z.enum(USED_DEVICE_GRADES),
  batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
  knownDefects: z.string().trim().max(2000).optional().nullable(),
  includedAccessories: z.string().trim().max(1000).optional().nullable(),
  askingPrice: paisa,
  warrantyMonths: z.number().int().min(0).max(120).optional().nullable(),
  warrantyDays: z.number().int().min(0).max(3650).optional().nullable(),
  actorId: z.string().min(1),
}).refine((input) => input.warrantyMonths == null || input.warrantyDays == null, {
  path: ['warrantyDays'],
  message: 'Choose either days or months for the warranty.',
});
export type UpdateUsedDeviceInput = z.infer<typeof updateUsedDeviceSchema>;

/**
 * STOCK OUT. A "sale" is just this, with reason=SALE and a salePrice. PLAN.md §1.1.
 */
const stockOutBaseSchema = z.object({
    productId: z.string().uuid(),
    reason: z.enum(['SALE', 'DAMAGE', 'LOSS', 'INTERNAL_USE', 'SHOP_USE', 'GIFT', 'RETURN_TO_SUPPLIER']),

    serialNo: z.string().min(1).optional(), // SERIAL products
    quantity: z.number().int().positive().optional(), // QUANTITY products

    salePrice: paisa.optional(),
    customerName: z.string().max(150).optional().nullable(),
    customerPhone: z.string().max(30).optional().nullable(),
    supplierId: z.string().uuid().optional().nullable(),
    reference: z.string().max(100).optional().nullable(),
    note: z.string().max(1000).optional().nullable(),
    actorId: z.string(),
    idempotencyKey: z.string().min(8),
  });

export const stockOutSchema = stockOutBaseSchema
  .refine((i) => Boolean(i.serialNo) !== Boolean(i.quantity), {
    message: 'Provide a device number/IMEI for an individually tracked product or a quantity for a bulk/count-based product.',
  })
  .refine((i) => i.reason !== 'SALE' || i.salePrice !== undefined, {
    message: 'A SALE needs a selling price — the financial reports depend on it',
    path: ['salePrice'],
  });
export type StockOutInput = z.infer<typeof stockOutSchema>;

export const supplierReturnFieldsSchema = z.object({
  supplierId: z.string().uuid('Choose the supplier receiving these items.'),
  returnReason: z.enum(SUPPLIER_RETURN_REASONS),
});

export const createSupplierReturnSchema = stockOutBaseSchema.extend({
  reason: z.literal('RETURN_TO_SUPPLIER'),
  ...supplierReturnFieldsSchema.shape,
}).refine((i) => Boolean(i.serialNo) !== Boolean(i.quantity), {
  message: 'Provide a device number/IMEI for an individually tracked product or a quantity for a bulk/count-based product.',
});
export type CreateSupplierReturnInput = z.infer<typeof createSupplierReturnSchema>;

export const settleSupplierReturnSchema = z.object({
  returnId: z.string().uuid(),
  recoveredAmount: paisa,
  recoveryMethod: z.enum(SUPPLIER_RECOVERY_METHODS),
  settlementReference: z.string().trim().max(100).optional().nullable(),
  settlementNote: z.string().trim().max(1000).optional().nullable(),
  actorId: z.string().min(1),
}).superRefine((input, context) => {
  if (input.recoveryMethod === 'NO_RECOVERY' && input.recoveredAmount !== 0) {
    context.addIssue({ code: 'custom', path: ['recoveredAmount'], message: 'No recovery must have a zero recovered amount.' });
  }
  if (input.recoveryMethod !== 'NO_RECOVERY' && input.recoveredAmount <= 0) {
    context.addIssue({ code: 'custom', path: ['recoveredAmount'], message: 'Enter the amount recovered from the supplier.' });
  }
});
export type SettleSupplierReturnInput = z.infer<typeof settleSupplierReturnSchema>;

export const cancelSupplierReturnSchema = z.object({
  returnId: z.string().uuid(),
  reason: z.string().trim().min(5, 'Give a clear cancellation reason using at least 5 characters.').max(1000),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type CancelSupplierReturnInput = z.infer<typeof cancelSupplierReturnSchema>;

export const createCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a customer name.')
    .max(150, 'Customer name must be 150 characters or fewer.'),
  phone: z
    .string()
    .trim()
    .min(1, 'A mobile number is required.')
    .max(30)
    .refine(
      isBangladeshMobile,
      'Enter a valid Bangladeshi mobile number, such as 01712345678 or +8801712345678.',
    ),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const checkoutSchema = z.object({
  cartId: z.string().uuid(),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(200),
});

/**
 * Credit cannot be attached to an anonymous walk-in sale. This schema is
 * shared by the checkout UI and server action so a crafted request cannot
 * bypass the saved-customer requirement.
 */
export const regularCheckoutPaymentSchema = z.object({
  customerId: z.string().uuid().nullable(),
  paymentStatus: z.enum(['PAID', 'UNPAID']),
}).superRefine((value, context) => {
  if (value.paymentStatus === 'UNPAID' && !value.customerId) {
    context.addIssue({
      code: 'custom',
      path: ['customerId'],
      message: 'Choose or create a saved customer for an unpaid sale.',
    });
  }
});

/**
 * Browser checkout drafts are deliberately small and untrusted. Product names,
 * list prices, stock counts and totals are rebuilt from the database before a
 * sale is committed.
 */
export const localCheckoutLinesSchema = z.array(z.object({
  clientId: z.string().min(1).max(100),
  productId: z.string().uuid(),
  unitId: z.string().uuid().nullable(),
  quantity: z.number().int().positive().max(10_000),
  actualUnitPrice: paisa,
})).min(1, 'Add at least one item before checkout.').max(250, 'A checkout may contain at most 250 lines.');
export type LocalCheckoutLinesInput = z.infer<typeof localCheckoutLinesSchema>;

export const productStaffDiscountFieldsSchema = z.object({
  staffMaxDiscount: z.string().trim()
    .min(1, 'Enter the maximum discount STAFF may apply to this product.')
    .refine((value) => {
      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return false;
      try { return parseBDT(value) >= 0; } catch { return false; }
    }, 'Enter a valid amount of zero or more.')
    .transform((value) => parseBDT(value)),
});
export type ProductStaffDiscountFields = z.input<typeof productStaffDiscountFieldsSchema>;

/** Corrections: never edit a movement, write an opposing one. PLAN.md §8.3. */
export const correctionSchema = z.object({
  movementId: z.string().uuid(),
  note: z.string().min(1, 'A correction must say why').max(1000),
  actorId: z.string(),
  idempotencyKey: z.string().min(8),
});
export type CorrectionInput = z.infer<typeof correctionSchema>;

/** Shared by the invoice void dialog and its server boundary. */
export const voidInvoiceFieldsSchema = z.object({
  reason: z.string().trim()
    .min(5, 'Give a clear reason using at least 5 characters.')
    .max(1000, 'The reason must not exceed 1000 characters.'),
  refundMethod: z.enum(PAYMENT_METHODS).nullable(),
  confirmed: z.boolean().refine((value) => value, {
    message: 'Confirm that you verified the invoice, refund, and physical items.',
  }),
});
export type VoidInvoiceFields = z.infer<typeof voidInvoiceFieldsSchema>;

/** Shared by the regular unpaid-invoice collection form and server action. */
export const invoicePaymentCollectionFieldsSchema = z.object({
  amount: z.string().trim()
    .min(1, 'Enter the amount received.')
    .refine((value) => {
      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return false;
      try { return parseBDT(value) > 0; } catch { return false; }
    }, 'Enter a valid amount greater than zero.')
    .transform((value) => parseBDT(value)),
  paymentMethod: z.enum(PAYMENT_METHODS, { message: 'Choose the payment method.' }),
  reference: optionalFormText(120),
  note: optionalFormText(1000),
});
export type InvoicePaymentCollectionFieldsInput = z.input<typeof invoicePaymentCollectionFieldsSchema>;
export type InvoicePaymentCollectionFields = z.output<typeof invoicePaymentCollectionFieldsSchema>;

export const createUserSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email(),
  role: z.enum(ROLES).default('STAFF'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const searchSchema = z.object({
  q: z.string().min(1).max(120).trim(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const unitStatusSchema = z.enum(UNIT_STATUSES);
export const movementReasonSchema = z.enum(MOVEMENT_REASONS);

export const expenseFieldsSchema = z.object({
  expenseDate: expenseDateInput,
  categoryId: z.string().min(1, 'Choose an expense category.'),
  description: z.string().trim()
    .min(3, 'Describe the expense using at least 3 characters.')
    .max(300, 'Description must not exceed 300 characters.'),
  amount: expenseAmountInput,
  paidTo: optionalFormText(150),
  paymentMethod: z.enum(PAYMENT_METHODS, { message: 'Choose a payment method.' }),
  reference: optionalFormText(120),
  note: optionalFormText(1000),
});
export type ExpenseFieldsInput = z.input<typeof expenseFieldsSchema>;
export type ExpenseFields = z.output<typeof expenseFieldsSchema>;

export const createExpenseSchema = expenseFieldsSchema.extend({
  actorId: z.string().min(1),
});

export const updateExpenseSchema = expenseFieldsSchema.extend({
  expenseId: z.string().min(1),
  actorId: z.string().min(1),
});

export const voidExpenseFieldsSchema = z.object({
  reason: z.string().trim()
    .min(5, 'Give a clear reason using at least 5 characters.')
    .max(1000, 'The reason must not exceed 1000 characters.'),
  confirmed: z.boolean().refine((value) => value, {
    message: 'Confirm that this expense should be voided.',
  }),
});

export const createExpenseCategorySchema = z.object({
  name: z.string().trim()
    .min(2, 'Category name must contain at least 2 characters.')
    .max(100, 'Category name must not exceed 100 characters.'),
});

export const createWarrantyClaimSchema = z.object({
  serialNo: z.string().min(1).max(120).trim(),
  claimantName: z.string().max(150).optional().nullable(),
  claimantPhone: z.string().max(30).optional().nullable(),
  reportedIssue: z.string().min(5).max(2000).trim(),
  physicalCondition: z.string().max(1000).optional().nullable(),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type CreateWarrantyClaimInput = z.infer<typeof createWarrantyClaimSchema>;

export const transitionWarrantyClaimSchema = z.object({
  claimId: z.string().uuid(),
  expectedStatus: z.enum(RMA_STATUSES),
  nextStatus: z.enum(RMA_STATUSES),
  custody: z.enum(RMA_CUSTODIES).optional(),
  coverage: z.enum(RMA_COVERAGES).optional(),
  assignedToId: z.string().optional().nullable(),
  resolution: z.string().max(2000).optional().nullable(),
  note: z.string().min(1).max(2000),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type TransitionWarrantyClaimInput = z.infer<typeof transitionWarrantyClaimSchema>;

export const warrantyHandoverSchema = z.object({
  claimId: z.string().uuid(),
  expectedStatus: z.enum(RMA_STATUSES),
  expectedCustody: z.enum(RMA_CUSTODIES),
  custody: z.enum(RMA_CUSTODIES),
  note: z.string().min(1).max(2000),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type WarrantyHandoverInput = z.infer<typeof warrantyHandoverSchema>;

export const warrantyResolutionSchema = z.object({
  claimId: z.string().uuid(),
  expectedStatus: z.enum(RMA_STATUSES),
  outcome: z.enum(['REPLACEMENT', 'RESTOCK', 'WRITEOFF']),
  replacementSerial: z.string().max(120).optional(),
  note: z.string().min(1).max(2000),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type WarrantyResolutionInput = z.infer<typeof warrantyResolutionSchema>;

export const supplierWarrantyCaseSchema = z.object({
  claimId: z.string().uuid(),
  supplierId: z.string().uuid(),
  reference: z.string().max(100).optional().nullable(),
  status: z.enum(SUPPLIER_WARRANTY_STATUSES),
  coverage: z.enum(RMA_COVERAGES),
  resolution: z.string().max(2000).optional().nullable(),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type SupplierWarrantyCaseInput = z.infer<typeof supplierWarrantyCaseSchema>;

export const emiCheckoutFieldsSchema = z.object({
  isEmi: z.boolean(),
  termMonths: z.coerce.number().refine((value) => EMI_TERMS.includes(value as 3 | 6 | 9 | 12), 'Choose an EMI term.'),
  downPayment: z.union([z.string(), z.number()])
    .transform((value) => typeof value === 'number' ? value : value.trim() ? parseBDT(value) : 0)
    .pipe(paisa.refine((value) => value % 100 === 0, 'Use a whole-taka down payment without decimal places.')),
  firstDueDate: z.coerce.date(),
  identificationType: z.enum(CUSTOMER_IDENTIFICATION_TYPES, { message: 'Choose an identification type.' }),
  identificationNumber: z.string().trim().min(3, 'Enter the customer identification number.').max(100),
});

export const emiPaymentSchema = z.object({
  contractId: z.string().uuid(),
  amount: expenseAmountInput.refine((value) => value % 100 === 0, 'Use a whole-taka payment without decimal places.'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: optionalFormText(120),
  note: optionalFormText(500),
  idempotencyKey: z.string().min(8),
});

export const emiEarlySettlementSchema = z.object({
  contractId: z.string().uuid(),
  discountAmount: z.union([z.string(), z.number()]).transform((value) => typeof value === 'number' ? value : value.trim() ? parseBDT(value) : 0).pipe(paisa.refine((value) => value % 100 === 0, 'Use a whole-taka discount without decimal places.')),
  paymentMethod: z.enum(PAYMENT_METHODS),
  reason: z.string().trim().min(5, 'Give a clear reason using at least 5 characters.').max(500),
  reference: optionalFormText(120),
  idempotencyKey: z.string().min(8),
});
