import type {
  Brand,
  Category,
  Product,
  ProductUnit,
  StockMovement,
  Supplier,
  UnitStatus,
  User,
  MovementReason,
  MovementType,
  WarrantyClaim,
  WarrantyClaimEvent,
  SupplierWarrantyCase,
  RmaStatus,
  Customer,
  CartDraft,
  Sale,
  SaleItem,
  SaleSettlement,
  InvoiceItem,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  UsedDeviceAcquisition,
  RefurbishmentExpense,
  SupplierReturn,
  ExpenseCategory,
  OperatingExpense,
  OperatingExpenseStatus,
  EmiContract,
  EmiInstallment,
  EmiPayment,
  EmiPaymentAllocation,
  EmiEarlySettlement,
} from '@/domain/types';
import type { Paisa } from '@/lib/money';

/**
 * THE SEAM. PLAN.md §13.2.
 *
 * Everything above this line (services, server actions, UI) imports only from
 * `@/repositories`. Nothing above this line knows whether the data lives in JSON
 * files or in Postgres. That is what makes Phase 1 a config change instead of a
 * rewrite.
 *
 * Every method is async EVEN IN THE JSON IMPLEMENTATION, so that no call site
 * changes when Prisma takes over.
 */

export interface CategoryRepository {
  findAll(filters?: { activeOnly?: boolean }): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  create(data: Omit<Category, 'createdAt' | 'updatedAt'>): Promise<Category>;
  update(
    id: string,
    data: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Category>;
}

export interface BrandRepository {
  findAll(filters?: { activeOnly?: boolean }): Promise<Brand[]>;
  findById(id: string): Promise<Brand | null>;
  create(data: Omit<Brand, 'createdAt' | 'updatedAt'>): Promise<Brand>;
  update(
    id: string,
    data: Partial<Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Brand>;
}

export interface SupplierRepository {
  findAll(): Promise<Supplier[]>;
  findById(id: string): Promise<Supplier | null>;
  create(data: Omit<Supplier, 'createdAt' | 'updatedAt'>): Promise<Supplier>;
  update(
    id: string,
    data: Partial<Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Supplier>;
}

export interface UserRepository {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
}

export interface ProductRepository {
  findAll(filters?: { categoryId?: string; brandId?: string; activeOnly?: boolean }): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findByBarcode(barcode: string): Promise<Product | null>;
  search(query: string, limit?: number): Promise<Product[]>;
  create(data: Product): Promise<Product>;
  update(
    id: string,
    data: Partial<Omit<Product, 'id' | 'trackingType' | 'quantityOnHand' | 'avgCostPrice' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Product>;
  softDelete(id: string): Promise<void>;

  /**
   * ⚠️ Cache maintenance for QUANTITY products ONLY. Called exclusively from
   * inside the stock service's transaction, never from a route or UI.
   *
   * ⚠️ NOTE WHAT IS *NOT* HERE: there is deliberately no `adjustStock(id, delta)`
   * public method. Stock may only move via StockMovementRepository.record().
   * If a caller can change stock without writing a ledger row, the ledger is a lie.
   * See PLAN.md §5.1.
   */
  _applyQuantityDelta(id: string, delta: number, newAvgCost?: Paisa): Promise<Product>;
}

export interface ProductUnitRepository {
  findById(id: string): Promise<ProductUnit | null>;
  findBySerial(serialNo: string): Promise<ProductUnit | null>;
  findBySerials(serialNos: readonly string[]): Promise<ProductUnit[]>;
  findByProduct(productId: string, status?: UnitStatus): Promise<ProductUnit[]>;
  countInStock(productId: string): Promise<number>;
  findAllInStock(): Promise<ProductUnit[]>;
  createMany(units: ProductUnit[]): Promise<ProductUnit[]>;
  updateDetails(
    id: string,
    patch: Partial<Pick<ProductUnit,
      'costPrice' | 'warrantyMonths' | 'warrantyDays' | 'location' | 'note' | 'usedGrade' |
      'batteryHealth' | 'inspectionResults' | 'knownDefects' |
      'includedAccessories' | 'askingPrice'>>,
  ): Promise<ProductUnit>;

  /**
   * Optimistic concurrency: succeeds ONLY if the unit is currently in `expectedStatus`.
   * Throws otherwise. This is what stops two staff selling the same IMEI at once.
   * In Prisma this becomes `where: { id, status: expectedStatus }`. PLAN.md §8.1.
   */
  transitionStatus(
    id: string,
    expectedStatus: UnitStatus,
    next: UnitStatus,
    patch?: Partial<ProductUnit>,
  ): Promise<ProductUnit>;
}

export interface CustomerRepository {
  findAll(activeOnly?: boolean): Promise<Customer[]>;
  findById(id: string): Promise<Customer | null>;
  findByNormalizedPhone(phoneNormalized: string): Promise<Customer | null>;
  search(query: string, limit?: number): Promise<Customer[]>;
  create(value: Customer): Promise<Customer>;
  update(id: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'phoneNormalized' | 'identificationType' | 'identificationNumber' | 'isActive'>>): Promise<Customer>;
}

export interface CartRepository {
  findByActor(actorId: string): Promise<CartDraft | null>;
  findById(id: string): Promise<CartDraft | null>;
  create(value: CartDraft): Promise<CartDraft>;
  update(id: string, patch: Partial<Pick<CartDraft, 'tradeInDraft'>>): Promise<CartDraft>;
  delete(id: string): Promise<void>;
}

export interface UsedDeviceAcquisitionRepository {
  findById(id: string): Promise<UsedDeviceAcquisition | null>;
  findByIdempotencyKey(key: string): Promise<UsedDeviceAcquisition | null>;
  findByUnit(unitId: string): Promise<UsedDeviceAcquisition | null>;
  findBySale(saleId: string): Promise<UsedDeviceAcquisition | null>;
  findAvailableTradeIns(): Promise<UsedDeviceAcquisition[]>;
  create(value: UsedDeviceAcquisition): Promise<UsedDeviceAcquisition>;
  attachToSale(id: string, saleId: string): Promise<UsedDeviceAcquisition>;
}

export interface RefurbishmentExpenseRepository {
  findByUnit(unitId: string): Promise<RefurbishmentExpense[]>;
  create(value: RefurbishmentExpense): Promise<RefurbishmentExpense>;
}

export interface SupplierReturnRepository {
  nextReturnNumber(now: Date): Promise<string>;
  findAll(): Promise<SupplierReturn[]>;
  findById(id: string): Promise<SupplierReturn | null>;
  findByMovement(movementId: string): Promise<SupplierReturn | null>;
  create(value: SupplierReturn): Promise<SupplierReturn>;
  settle(
    id: string,
    patch: Pick<SupplierReturn,
      'status' | 'recoveredAmount' | 'recoveryMethod' | 'settlementReference' |
      'settlementNote' | 'settledById' | 'settledAt' | 'updatedAt'>,
  ): Promise<SupplierReturn>;
  cancel(
    id: string,
    patch: Pick<SupplierReturn, 'status' | 'settlementNote' | 'settledById' | 'settledAt' | 'updatedAt'>,
  ): Promise<SupplierReturn>;
}

export interface ExpenseCategoryRepository {
  findAll(): Promise<ExpenseCategory[]>;
  findById(id: string): Promise<ExpenseCategory | null>;
  create(value: ExpenseCategory): Promise<ExpenseCategory>;
  update(id: string, patch: Pick<ExpenseCategory, 'name' | 'isActive' | 'updatedAt'>): Promise<ExpenseCategory>;
}

export type ExpenseOrder = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc';
export interface OperatingExpenseFilters {
  query?: string;
  from?: Date;
  to?: Date;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  recordedById?: string;
  status?: OperatingExpenseStatus;
  minAmount?: Paisa;
  maxAmount?: Paisa;
  order?: ExpenseOrder;
}

export interface OperatingExpenseRepository {
  nextExpenseNumber(now: Date): Promise<string>;
  findAll(filters?: OperatingExpenseFilters, limit?: number): Promise<OperatingExpense[]>;
  findById(id: string): Promise<OperatingExpense | null>;
  create(value: OperatingExpense): Promise<OperatingExpense>;
  update(id: string, patch: Pick<OperatingExpense,
    'expenseDate' | 'categoryId' | 'description' | 'amount' | 'paidTo' |
    'paymentMethod' | 'reference' | 'note' | 'updatedById' | 'updatedAt'>): Promise<OperatingExpense>;
  void(id: string, patch: Pick<OperatingExpense,
    'status' | 'voidedById' | 'voidedAt' | 'voidReason' | 'updatedById' | 'updatedAt'>): Promise<OperatingExpense>;
}

export interface SaleRepository {
  nextInvoiceNumber(now: Date): Promise<string>;
  findAll(limit?: number): Promise<Sale[]>;
  findVoidedByDateRange(from: Date, to: Date): Promise<Sale[]>;
  search(filters: SaleFilters, limit?: number): Promise<Sale[]>;
  findById(id: string): Promise<Sale | null>;
  findByInvoiceNumber(invoiceNumber: string): Promise<Sale | null>;
  findByIdempotencyKey(key: string): Promise<Sale | null>;
  findByCustomer(customerId: string): Promise<Sale[]>;
  create(value: Sale): Promise<Sale>;
  updatePayment(id: string, expectedAmountPaid: Paisa, patch: Pick<Sale, 'amountPaid' | 'paymentStatus' | 'paymentMethod'>): Promise<Sale>;
  markVoided(
    id: string,
    patch: Pick<Sale, 'status' | 'voidedAt' | 'voidedById' | 'voidedByName' | 'voidReason' | 'refundAmount' | 'refundMethod' | 'voidIdempotencyKey'>,
  ): Promise<Sale>;
  createItem(value: SaleItem): Promise<SaleItem>;
  findItems(saleId: string): Promise<InvoiceItem[]>;
}

export interface SaleSettlementRepository {
  nextReceiptNumber(type: SaleSettlement['type'], now: Date): Promise<string>;
  findBySale(saleId: string): Promise<SaleSettlement[]>;
  findByIdempotencyKey(key: string): Promise<SaleSettlement | null>;
  create(value: SaleSettlement): Promise<SaleSettlement>;
}

export interface EmiRepository {
  nextContractNumber(now: Date): Promise<string>;
  nextReceiptNumber(now: Date): Promise<string>;
  findContracts(): Promise<EmiContract[]>;
  findContractById(id: string): Promise<EmiContract | null>;
  findContractBySale(saleId: string): Promise<EmiContract | null>;
  createContract(value: EmiContract): Promise<EmiContract>;
  updateContract(id: string, patch: Partial<Pick<EmiContract, 'status' | 'completedAt' | 'voidedAt' | 'updatedAt'>>): Promise<EmiContract>;
  findInstallments(contractId: string): Promise<EmiInstallment[]>;
  createInstallment(value: EmiInstallment): Promise<EmiInstallment>;
  updateInstallment(id: string, patch: Partial<Pick<EmiInstallment, 'amountDue' | 'amountPaid' | 'status' | 'paidAt' | 'updatedAt'>>): Promise<EmiInstallment>;
  findPayments(contractId: string): Promise<EmiPayment[]>;
  findPaymentByIdempotencyKey(key: string): Promise<EmiPayment | null>;
  createPayment(value: EmiPayment): Promise<EmiPayment>;
  updatePayment(id: string, patch: Partial<Pick<EmiPayment, 'status' | 'reversedAt' | 'reverseReason'>>): Promise<EmiPayment>;
  findAllocations(paymentId: string): Promise<EmiPaymentAllocation[]>;
  createAllocation(value: EmiPaymentAllocation): Promise<EmiPaymentAllocation>;
  findEarlySettlement(contractId: string): Promise<EmiEarlySettlement | null>;
  createEarlySettlement(value: EmiEarlySettlement): Promise<EmiEarlySettlement>;
}

export interface SaleFilters {
  query?: string;
  status?: SaleStatus;
  from?: Date;
  to?: Date;
  customerType?: 'WALK_IN' | 'REGISTERED';
  actorId?: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  minTotal?: Paisa;
  maxTotal?: Paisa;
}

export interface MovementFilters {
  productId?: string;
  supplierId?: string;
  type?: MovementType;
  reason?: MovementReason;
  actorId?: string;
}

export interface StockMovementRepository {
  /** Append-only. There is no update() and no delete(). By design. */
  record(movement: StockMovement): Promise<StockMovement>;
  findById(id: string): Promise<StockMovement | null>;
  findByIdempotencyKey(key: string): Promise<StockMovement | null>;
  findByProduct(productId: string): Promise<StockMovement[]>;
  findByDateRange(from: Date, to: Date, filters?: MovementFilters): Promise<StockMovement[]>;
  /** The invariant: this must always equal on-hand. PLAN.md §8.4. */
  sumQuantity(productId: string): Promise<number>;
}

export interface WarrantyRepository {
  nextClaimNumber(now: Date): Promise<string>;
  findAll(filters?: { status?: RmaStatus; unitId?: string; assignedToId?: string }): Promise<WarrantyClaim[]>;
  findById(id: string): Promise<WarrantyClaim | null>;
  findByIdempotencyKey(key: string): Promise<WarrantyClaim | null>;
  findActiveByUnit(unitId: string): Promise<WarrantyClaim | null>;
  create(claim: WarrantyClaim): Promise<WarrantyClaim>;
  transition(id: string, expectedStatus: RmaStatus, patch: Partial<WarrantyClaim>): Promise<WarrantyClaim>;
  findEvents(claimId: string): Promise<WarrantyClaimEvent[]>;
  findEventByIdempotencyKey(key: string): Promise<WarrantyClaimEvent | null>;
  createEvent(event: WarrantyClaimEvent): Promise<WarrantyClaimEvent>;
  findSupplierCase(claimId: string): Promise<SupplierWarrantyCase | null>;
  upsertSupplierCase(value: SupplierWarrantyCase): Promise<SupplierWarrantyCase>;
}

/**
 * Runs `fn` atomically. In the JSON phase this is a process-level mutex and is
 * NOT crash-safe (PLAN.md §13.1). In Phase 1 it becomes `prisma.$transaction`.
 * Services call this and don't care which they got.
 */
export type Transactor = <T>(fn: (repositories: Repositories) => Promise<T>) => Promise<T>;

export interface Repositories {
  categories: CategoryRepository;
  brands: BrandRepository;
  suppliers: SupplierRepository;
  users: UserRepository;
  products: ProductRepository;
  units: ProductUnitRepository;
  movements: StockMovementRepository;
  warranties: WarrantyRepository;
  customers: CustomerRepository;
  carts: CartRepository;
  sales: SaleRepository;
  saleSettlements: SaleSettlementRepository;
  usedDeviceAcquisitions: UsedDeviceAcquisitionRepository;
  refurbishmentExpenses: RefurbishmentExpenseRepository;
  supplierReturns: SupplierReturnRepository;
  expenseCategories: ExpenseCategoryRepository;
  operatingExpenses: OperatingExpenseRepository;
  emi: EmiRepository;
  transaction: Transactor;
}
