"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
} from "react";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  checkoutAction,
  clearTradeInDraftAction,
  expireCartDraftAction,
  type CheckoutActionState,
} from "@/actions/checkout";
import { ScannerInput } from "@/components/search/ScannerInput";
import { DiscardDraftControl } from "@/components/checkout/DiscardDraftControl";
import { CustomerCombobox } from "@/components/checkout/CustomerCombobox";
import {
  CheckoutProductCombobox,
  CheckoutUnitCombobox,
} from "@/components/checkout/CheckoutItemCombobox";
import { CreateCustomerForm } from "@/components/customers/CreateCustomerForm";
import {
  Button,
  Card,
  Field,
  HelpTerm,
  Input,
  MonoInput,
  Select,
  SerialChip,
  Textarea,
} from "@/components/ui";
import {
  PAYMENT_METHODS,
  type CartDraft,
  type Customer,
  type PaymentMethod,
  type PaymentStatus,
  type TrackingType,
  type Role,
} from "@/domain/types";
import { formatBDT, toTaka } from "@/lib/money";
import { useI18n } from "@/components/i18n/I18nProvider";
import { domainLabel } from "@/lib/i18n/domain";
import { emiCheckoutFieldsSchema, regularCheckoutPaymentSchema } from "@/schemas";
import { SHOP_LOGO_DATA_URI } from "@/lib/shop-branding";

export interface CheckoutProductOption {
  id: string;
  name: string;
  sku: string;
  trackingType: TrackingType;
  onHand: number;
  barcode: string | null;
  listUnitPrice: number;
  staffMaxDiscount: number;
}

export interface CheckoutUnitOption {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  serialNo: string;
  usedGrade: string | null;
  listUnitPrice: number;
  staffMaxDiscount: number;
  knownDefects: string | null;
  warrantyMonths: number | null;
  warrantyDays: number | null;
}

export interface CheckoutLine {
  id: string;
  productId: string;
  unitId: string | null;
  productName: string;
  sku: string;
  serialNo: string | null;
  trackingType: TrackingType;
  quantity: number;
  listUnitPrice: number;
  actualUnitPrice: number;
  staffMaxDiscount: number;
  position: number;
  onHand: number;
  usedGrade: string | null;
  knownDefects: string | null;
  warrantyMonths: number | null;
  warrantyDays: number | null;
}

const LOCAL_DRAFT_VERSION = 1;
const LOCAL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function previewDate(value: string): string {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00+06:00`));
}

interface StoredCheckoutDraft {
  version: 1;
  cartId: string;
  updatedAt: number;
  lines: Array<Pick<CheckoutLine, "id" | "productId" | "unitId" | "quantity" | "actualUnitPrice">>;
  customerId: string;
  saleMode: "CASH" | "EMI";
  emiTerm: 3 | 6 | 9 | 12;
  emiDownPayment: string;
  emiFirstDueDate: string;
  identificationType: string;
  identificationNumber: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  tradeInPayoutMethod: PaymentMethod;
  reference: string;
  note: string;
}

function Message({ state }: { state: CheckoutActionState }) {
  const { message } = useI18n();
  if (state.error)
    return <p className="mt-2 text-[12px] text-out">{message(state.error)}</p>;
  if (state.ok)
    return <p className="mt-2 text-[12px] text-ok">{message(state.ok)}</p>;
  return null;
}

function CartLineEditor({
  line,
  dragProps,
  dragging,
  dragDisabled,
  onChange,
  onRemove,
  onValidityChange,
  staffMinimumPrice,
  isEmi,
}: {
  line: CheckoutLine;
  dragProps: HTMLAttributes<HTMLDivElement>;
  dragging: boolean;
  dragDisabled: boolean;
  onChange: (lineId: string, patch: Pick<CheckoutLine, "quantity" | "actualUnitPrice">) => void;
  onRemove: (lineId: string) => void;
  onValidityChange: (lineId: string, valid: boolean) => void;
  staffMinimumPrice: number | null;
  isEmi: boolean;
}) {
  const { t } = useI18n();
  const [quantityValue, setQuantityValue] = useState(String(line.quantity));
  const [priceValue, setPriceValue] = useState(
    String(toTaka(line.actualUnitPrice)),
  );
  const maximumQuantity = Math.max(1, line.onHand);
  const parsedQuantity = Number.parseInt(quantityValue, 10);
  const quantity = Number.isFinite(parsedQuantity)
    ? Math.min(maximumQuantity, Math.max(1, parsedQuantity))
    : line.quantity;
  const parsedPrice = Number(priceValue);
  const displayUnitPrice =
    Number.isFinite(parsedPrice) && parsedPrice >= 0
      ? Math.round(parsedPrice * 100)
      : line.actualUnitPrice;
  const priceFormatValid = isEmi ? /^\d+$/.test(priceValue) : /^\d+(\.\d{1,2})?$/.test(priceValue);
  const emiPriceHasFraction = isEmi && /^\d+\.\d{1,2}$/.test(priceValue);
  const priceBelowFloor = staffMinimumPrice !== null && displayUnitPrice < staffMinimumPrice;
  const priceValid = priceFormatValid && !priceBelowFloor;

  useEffect(() => {
    setQuantityValue(String(line.quantity));
    setPriceValue(String(toTaka(line.actualUnitPrice)));
  }, [line.actualUnitPrice, line.quantity]);

  useEffect(() => {
    onValidityChange(line.id, priceValid);
  }, [line.id, onValidityChange, priceValid]);

  useEffect(
    () => () => {
      onValidityChange(line.id, true);
    },
    [line.id, onValidityChange],
  );

  const stepQuantity = (change: -1 | 1) => {
    setQuantityValue((currentValue) => {
      const current = Number.parseInt(currentValue, 10);
      const startingQuantity = Number.isFinite(current)
        ? current
        : line.quantity;
      const next = Math.min(maximumQuantity, Math.max(1, startingQuantity + change));
      onChange(line.id, { quantity: next, actualUnitPrice: line.actualUnitPrice });
      return String(next);
    });
  };

  return (
    <div
      data-cart-line-id={line.id}
      tabIndex={dragDisabled ? undefined : 0}
      {...dragProps}
      className={`border-b border-rule-soft px-4 py-3 transition-[background-color,box-shadow,transform] last:border-0 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-signal ${
        dragDisabled ? "" : "touch-none cursor-grab active:cursor-grabbing"
      } ${dragging ? "relative z-10 bg-signal-wash shadow-md" : "hover:bg-plate/35"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{line.productName}</p>
          <p className="tnum text-[11px] text-graphite">{line.sku}</p>
          {line.usedGrade && <p className="mt-1 text-[11px] font-medium text-signal">{line.usedGrade === 'REFURBISHED' ? t('used.refurbished') : `${t('used.usedPhone')} · ${line.usedGrade.replace('GRADE_', `${t('used.grade')} `)}`}</p>}
          {(line.warrantyDays || line.warrantyMonths) && (
            <p className="mt-1 text-[11px] text-graphite">
              {t('used.warrantyDuration')}: {line.warrantyDays
                ? `${line.warrantyDays} ${line.warrantyDays === 1 ? t('used.warrantyDay') : t('used.warrantyDays')}`
                : `${line.warrantyMonths} ${line.warrantyMonths === 1 ? t('used.warrantyMonth') : t('used.warrantyMonths')}`}
            </p>
          )}
          {line.knownDefects && <p className="mt-1 max-w-xl text-[11px] text-out">{t('used.knownDefects')}: {line.knownDefects}</p>}
          <p className="mt-1 text-[11px] text-graphite">
            {t("checkout.listPrice", { price: formatBDT(line.listUnitPrice) })}
          </p>
        </div>
        <p className="tnum text-[13px] font-semibold">
          {formatBDT(
            displayUnitPrice * (line.trackingType === "SERIAL" ? 1 : quantity),
          )}
        </p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[9rem_10rem_auto]">
        {line.trackingType === "SERIAL" ? (
          <Field label={t("checkout.serialImei")}>
            <div className="flex min-h-10 items-center">
              {line.serialNo ? (
                <SerialChip serial={line.serialNo} />
              ) : (
                <span className="text-graphite">—</span>
              )}
            </div>
          </Field>
        ) : (
          <Field label={t("common.quantity")}>
            <div className="inline-grid grid-cols-[2.25rem_4.5rem_2.25rem]">
              <button
                type="button"
                className="h-9 rounded-l-[3px] border border-rule bg-card text-[18px] leading-none text-ink transition-colors hover:border-signal hover:bg-signal-wash disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("checkout.decreaseQuantity")}
                onClick={() => stepQuantity(-1)}
                disabled={quantity <= 1}
              >
                −
              </button>
              <MonoInput
                className="rounded-none px-1 text-center"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={t("common.quantity")}
                value={quantityValue}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "" || /^\d+$/.test(value)) {
                    setQuantityValue(value);
                    const parsed = Number.parseInt(value, 10);
                    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= maximumQuantity) {
                      onChange(line.id, { quantity: parsed, actualUnitPrice: line.actualUnitPrice });
                    }
                  }
                }}
                onBlur={() => {
                  setQuantityValue(String(quantity));
                  onChange(line.id, { quantity, actualUnitPrice: line.actualUnitPrice });
                }}
              />
              <button
                type="button"
                className="h-9 rounded-r-[3px] border border-rule bg-card text-[18px] leading-none text-ink transition-colors hover:border-signal hover:bg-signal-wash disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("checkout.increaseQuantity")}
                onClick={() => stepQuantity(1)}
                disabled={quantity >= maximumQuantity}
              >
                +
              </button>
            </div>
          </Field>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-end gap-2 sm:contents">
          <Field
            label={isEmi ? t("checkout.emiSellingPrice") : t("products.sellingPrice")}
            hint={staffMinimumPrice !== null
              ? t('checkout.staffMinimumPrice', { price: formatBDT(staffMinimumPrice) })
              : undefined}
            error={emiPriceHasFraction
              ? t("checkout.wholeTakaEmiPrice")
              : priceBelowFloor ? t('checkout.staffPriceTooLow') : undefined}
          >
            <MonoInput
              inputMode="decimal"
              step={isEmi ? "1" : "0.01"}
              required
              min={staffMinimumPrice === null ? undefined : toTaka(staffMinimumPrice)}
              value={priceValue}
              onChange={(event) => {
                const value = event.target.value;
                setPriceValue(value);
                const entered = Number(value);
                const validFormat = isEmi ? /^\d+$/.test(value) : /^\d+(\.\d{1,2})?$/.test(value);
                if (validFormat
                  && (staffMinimumPrice === null || Math.round(entered * 100) >= staffMinimumPrice)) {
                  onChange(line.id, {
                    quantity: line.quantity,
                    actualUnitPrice: Math.round(entered * 100),
                  });
                }
              }}
              onBlur={() => {
                if (priceFormatValid && !priceBelowFloor) {
                  onChange(line.id, { quantity: line.quantity, actualUnitPrice: displayUnitPrice });
                }
              }}
            />
          </Field>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-rule bg-card text-out transition-colors hover:bg-out-wash disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
            aria-label={t("checkout.remove")}
            title={t("checkout.remove")}
            onClick={() => onRemove(line.id)}
          >
            <Trash2 aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.25} />
          </button>
        </div>
        <div className="flex items-end justify-between gap-2 sm:justify-end">
          <div className="hidden sm:block">
            <Button
              type="button"
              variant="danger"
              className="gap-1.5"
              onClick={() => onRemove(line.id)}
            >
              <Trash2 aria-hidden="true" size={15} />
              {t("checkout.remove")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CheckoutWorkspace({
  cart,
  shopName,
  initialIdentifier,
  lines,
  products,
  units,
  customers,
  role,
}: {
  cart: CartDraft;
  shopName: string;
  initialIdentifier?: string;
  lines: CheckoutLine[];
  products: CheckoutProductOption[];
  units: CheckoutUnitOption[];
  customers: Customer[];
  role: Role;
}) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [checkoutKey, setCheckoutKey] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [saleMode, setSaleMode] = useState<"CASH" | "EMI">("CASH");
  const [emiTerm, setEmiTerm] = useState<3 | 6 | 9 | 12>(3);
  const [emiDownPayment, setEmiDownPayment] = useState("0");
  const [emiFirstDueDate, setEmiFirstDueDate] = useState("");
  const [identificationType, setIdentificationType] = useState("");
  const [identificationNumber, setIdentificationNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PAID");
  const [tradeInPayoutMethod, setTradeInPayoutMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [emiErrors, setEmiErrors] = useState<Record<string, string>>({});
  const [regularErrors, setRegularErrors] = useState<Record<string, string>>({});
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [confirmingTradeInRemoval, setConfirmingTradeInRemoval] = useState(false);
  const [orderedLines, setOrderedLines] = useState(lines);
  const orderedLinesRef = useRef(lines);
  const scannerFormRef = useRef<HTMLFormElement>(null);
  const cartLinesRef = useRef<HTMLDivElement>(null);
  const previousLinePositionsRef = useRef<Map<string, DOMRect> | null>(null);
  const lineAnimationsRef = useRef<Map<string, Animation>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [reorderState, setReorderState] = useState<CheckoutActionState>({});
  const [invalidLineIds, setInvalidLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [addState, setAddState] = useState<CheckoutActionState>({});
  const [checkoutState, completeAction, checkingOut] = useActionState(
    checkoutAction,
    {},
  );
  const [clearTradeInState, clearTradeInAction, clearingTradeIn] = useActionState(
    clearTradeInDraftAction,
    {},
  );
  const storageKey = `ims:checkout-draft:v${LOCAL_DRAFT_VERSION}:${cart.actorId}`;
  const [draftHydrated, setDraftHydrated] = useState(false);
  const skipPersistRef = useRef(false);
  const expiryInFlightRef = useRef(false);
  const hasInvalidLines = invalidLineIds.size > 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
  const maxEmiDueDate = useMemo(() => {
    const value = new Date(`${today}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + 31);
    return value.toISOString().slice(0, 10);
  }, [today]);

  function clearEmiError(field: string) {
    setEmiErrors((current) => { const next = { ...current }; delete next[field]; return next; });
  }

  function chooseCustomer(customerId: string) {
    const customer = customers.find((entry) => entry.id === customerId);
    setSelectedCustomerId(customerId);
    setIdentificationType(customer?.identificationType ?? "");
    setIdentificationNumber(customer?.identificationNumber ?? "");
    clearEmiError('identificationType'); clearEmiError('identificationNumber');
    setRegularErrors({});
  }

  const setLineOrder = useCallback((next: CheckoutLine[]) => {
    orderedLinesRef.current = next;
    setOrderedLines(next);
  }, []);

  const discardLocalDraft = useCallback(() => {
    skipPersistRef.current = true;
    window.localStorage.removeItem(storageKey);
    setLineOrder([]);
    setSelectedCustomerId("");
    setSaleMode("CASH");
    setEmiTerm(3);
    setEmiDownPayment("0");
    setEmiFirstDueDate("");
    setIdentificationType("");
    setIdentificationNumber("");
    setPaymentMethod("CASH");
    setPaymentStatus("PAID");
    setReference("");
    setNote("");
    setAddState({});
  }, [setLineOrder, storageKey]);

  const expireDraft = useCallback(async () => {
    if (expiryInFlightRef.current) return;
    expiryInFlightRef.current = true;
    discardLocalDraft();
    if (!cart.tradeInDraft) {
      expiryInFlightRef.current = false;
      return;
    }
    const data = new FormData();
    data.set("cartId", cart.id);
    const result = await expireCartDraftAction(data);
    if (result.error) {
      expiryInFlightRef.current = false;
      setAddState({ error: result.error });
      return;
    }
    router.refresh();
  }, [cart.id, cart.tradeInDraft, discardLocalDraft, router]);

  function requestCheckoutConfirmation() {
    if (isEmi) {
      const parsed = emiCheckoutFieldsSchema.safeParse({
        isEmi: true,
        termMonths: emiTerm,
        downPayment: emiDownPayment,
        firstDueDate: emiFirstDueDate,
        identificationType,
        identificationNumber,
      });
      if (!parsed.success) {
        setEmiErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
        return;
      }
    } else {
      const parsed = regularCheckoutPaymentSchema.safeParse({
        customerId: selectedCustomerId || null,
        paymentStatus,
      });
      if (!parsed.success) {
        setRegularErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
        return;
      }
    }
    setEmiErrors({});
    setRegularErrors({});
    setConfirmingCheckout(true);
  }

  const handleLineValidity = useCallback((lineId: string, valid: boolean) => {
    setInvalidLineIds((current) => {
      if (current.has(lineId) === !valid) return current;
      const next = new Set(current);
      if (valid) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  useEffect(() => setCheckoutKey(crypto.randomUUID()), []);

  useLayoutEffect(() => {
    let restoredLines = lines;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as Partial<StoredCheckoutDraft>;
        const expired = typeof stored.updatedAt !== "number"
          || Date.now() - stored.updatedAt >= LOCAL_DRAFT_TTL_MS;
        if (stored.version !== LOCAL_DRAFT_VERSION || stored.cartId !== cart.id) {
          window.localStorage.removeItem(storageKey);
        } else if (expired) {
          void expireDraft();
          restoredLines = [];
        } else if (Array.isArray(stored.lines)) {
          restoredLines = stored.lines.flatMap((saved, position) => {
            const product = products.find((entry) => entry.id === saved.productId);
            const unit = saved.unitId
              ? units.find((entry) => entry.id === saved.unitId && entry.productId === saved.productId)
              : null;
            if (!product || (product.trackingType === "SERIAL" && !unit)) return [];
            return [{
              id: typeof saved.id === "string" ? saved.id : crypto.randomUUID(),
              productId: product.id,
              unitId: unit?.id ?? null,
              productName: product.name,
              sku: product.sku,
              serialNo: unit?.serialNo ?? null,
              trackingType: product.trackingType,
              quantity: product.trackingType === "SERIAL" ? 1 : Math.max(1, Math.min(product.onHand, Number(saved.quantity) || 1)),
              listUnitPrice: unit?.listUnitPrice ?? product.listUnitPrice,
              actualUnitPrice: Number.isInteger(saved.actualUnitPrice) && saved.actualUnitPrice! >= 0
                ? saved.actualUnitPrice!
                : unit?.listUnitPrice ?? product.listUnitPrice,
              staffMaxDiscount: unit?.staffMaxDiscount ?? product.staffMaxDiscount,
              position,
              onHand: product.trackingType === "SERIAL" ? 1 : product.onHand,
              usedGrade: unit?.usedGrade ?? null,
              knownDefects: unit?.knownDefects ?? null,
              warrantyMonths: unit?.warrantyMonths ?? null,
              warrantyDays: unit?.warrantyDays ?? null,
            } satisfies CheckoutLine];
          });
          setSelectedCustomerId(typeof stored.customerId === "string" ? stored.customerId : "");
          setSaleMode(stored.saleMode === "EMI" ? "EMI" : "CASH");
          if ([3, 6, 9, 12].includes(Number(stored.emiTerm))) setEmiTerm(stored.emiTerm as 3 | 6 | 9 | 12);
          setEmiDownPayment(typeof stored.emiDownPayment === "string" ? stored.emiDownPayment : "0");
          setEmiFirstDueDate(typeof stored.emiFirstDueDate === "string" ? stored.emiFirstDueDate : "");
          setIdentificationType(typeof stored.identificationType === "string" ? stored.identificationType : "");
          setIdentificationNumber(typeof stored.identificationNumber === "string" ? stored.identificationNumber : "");
          setPaymentMethod(stored.paymentMethod ?? "CASH");
          setPaymentStatus(stored.paymentStatus ?? "PAID");
          setTradeInPayoutMethod(stored.tradeInPayoutMethod ?? "CASH");
          setReference(typeof stored.reference === "string" ? stored.reference : "");
          setNote(typeof stored.note === "string" ? stored.note : "");
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    orderedLinesRef.current = restoredLines;
    setOrderedLines(restoredLines);
    setDraftHydrated(true);
  // Initial hydration must run once for this signed-in user's checkout.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expireDraft, storageKey]);

  useEffect(() => {
    // Hydration and persistence effects can run during the same initial commit.
    // Wait for a render containing the restored browser draft so an older server
    // snapshot cannot overwrite it before the restored state is committed.
    if (!draftHydrated) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    const draft: StoredCheckoutDraft = {
      version: LOCAL_DRAFT_VERSION,
      cartId: cart.id,
      updatedAt: Date.now(),
      lines: orderedLines.map(({ id, productId, unitId, quantity, actualUnitPrice }) => ({
        id, productId, unitId, quantity, actualUnitPrice,
      })),
      customerId: selectedCustomerId,
      saleMode,
      emiTerm: emiTerm as 3 | 6 | 9 | 12,
      emiDownPayment,
      emiFirstDueDate,
      identificationType,
      identificationNumber,
      paymentMethod,
      paymentStatus,
      tradeInPayoutMethod,
      reference,
      note,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
    const expiryTimer = window.setTimeout(() => void expireDraft(), LOCAL_DRAFT_TTL_MS);
    return () => window.clearTimeout(expiryTimer);
  }, [draftHydrated, emiDownPayment, emiFirstDueDate, emiTerm, expireDraft, identificationNumber, identificationType, note, orderedLines, paymentMethod, paymentStatus, reference, saleMode, selectedCustomerId, storageKey, tradeInPayoutMethod]);

  useLayoutEffect(() => {
    const previous = previousLinePositionsRef.current;
    const container = cartLinesRef.current;
    previousLinePositionsRef.current = null;
    if (
      !previous ||
      !container ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    for (const element of container.querySelectorAll<HTMLElement>(
      "[data-cart-line-id]",
    )) {
      const id = element.dataset.cartLineId;
      const before = id ? previous.get(id) : undefined;
      if (!id || !before) continue;
      const after = element.getBoundingClientRect();
      const deltaY = before.top - after.top;
      if (Math.abs(deltaY) < 1) continue;
      lineAnimationsRef.current.get(id)?.cancel();
      const animation = element.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
      lineAnimationsRef.current.set(id, animation);
      animation.finished
        .finally(() => {
          if (lineAnimationsRef.current.get(id) === animation) {
            lineAnimationsRef.current.delete(id);
          }
        })
        .catch(() => undefined);
    }
  }, [orderedLines]);

  useEffect(() => {
    if (!confirmingCheckout) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !checkingOut) setConfirmingCheckout(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmingCheckout, checkingOut]);

  useEffect(() => {
    if (clearTradeInState.ok) setConfirmingTradeInRemoval(false);
  }, [clearTradeInState.ok]);

  const quantityProducts = products.filter(
    (product) => product.trackingType === "QUANTITY",
  );
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const subtotal = useMemo(
    () =>
      orderedLines.reduce(
        (sum, line) => sum + line.listUnitPrice * line.quantity,
        0,
      ),
    [orderedLines],
  );
  const isEmi = saleMode === "EMI";
  const total = useMemo(
    () =>
      orderedLines.reduce((sum, line) => sum + line.actualUnitPrice * line.quantity, 0),
    [orderedLines],
  );
  const tradeInProduct = products.find((product) => product.id === cart.tradeInDraft?.productId);
  const tradeInGrade = cart.tradeInDraft
    ? cart.tradeInDraft.grade === "REFURBISHED"
      ? t("used.refurbished")
      : cart.tradeInDraft.grade === "GRADE_A"
        ? t("used.gradeA")
        : cart.tradeInDraft.grade === "GRADE_B"
          ? t("used.gradeB")
          : t("used.gradeC")
    : null;
  const tradeInCredit = cart.tradeInDraft?.acquisitionValue
    ?? 0;
  const tradeInCashPayout = isEmi ? 0 : Math.max(0, tradeInCredit - total);
  const downPayment = (() => { const value = Number(emiDownPayment); return Number.isFinite(value) ? Math.round(value * 100) : 0; })();
  const amountDue = Math.max(0, total - tradeInCredit - (isEmi ? downPayment : 0));
  const priceAdjustment = total - subtotal;

  const addLocalItem = (input: { identifier?: string; productId?: string; unitId?: string }) => {
    const identifier = input.identifier?.trim();
    const unit = input.unitId
      ? units.find((entry) => entry.id === input.unitId)
      : identifier ? units.find((entry) => entry.serialNo === identifier) : undefined;
    const product = unit
      ? products.find((entry) => entry.id === unit.productId)
      : input.productId
        ? products.find((entry) => entry.id === input.productId)
        : identifier
          ? products.find((entry) => entry.barcode === identifier || entry.sku === identifier)
          : undefined;
    if (!product) {
      setAddState({ error: "No product or device number matches that identifier." });
      return;
    }
    if (product.trackingType === "SERIAL") {
      if (!unit) {
        setAddState({ error: "Scan or select the exact device number/IMEI for this individually tracked product." });
        return;
      }
      if (orderedLinesRef.current.some((line) => line.unitId === unit.id)) {
        setAddState({ error: `Device number ${unit.serialNo} is already in this cart.` });
        return;
      }
    } else {
      const existing = orderedLinesRef.current.find((line) => line.productId === product.id && !line.unitId);
      if (existing) {
        if (existing.quantity >= product.onHand) {
          setAddState({ error: `Only ${product.onHand} × ${product.name} are in stock.` });
          return;
        }
        const next = orderedLinesRef.current.map((line) => line.id === existing.id
          ? { ...line, quantity: line.quantity + 1 }
          : line);
        setLineOrder(next);
        setAddState({ ok: "Item added to the draft cart." });
        return;
      }
      if (product.onHand <= 0) {
        setAddState({ error: `${product.name} is out of stock.` });
        return;
      }
    }

    const listUnitPrice = unit?.listUnitPrice ?? product.listUnitPrice;
    const next = [...orderedLinesRef.current, {
      id: crypto.randomUUID(),
      productId: product.id,
      unitId: unit?.id ?? null,
      productName: product.name,
      sku: product.sku,
      serialNo: unit?.serialNo ?? null,
      trackingType: product.trackingType,
      quantity: 1,
      listUnitPrice,
      actualUnitPrice: listUnitPrice,
      staffMaxDiscount: unit?.staffMaxDiscount ?? product.staffMaxDiscount,
      position: orderedLinesRef.current.length,
      onHand: product.trackingType === "SERIAL" ? 1 : product.onHand,
      usedGrade: unit?.usedGrade ?? null,
      knownDefects: unit?.knownDefects ?? null,
      warrantyMonths: unit?.warrantyMonths ?? null,
      warrantyDays: unit?.warrantyDays ?? null,
    } satisfies CheckoutLine];
    setLineOrder(next);
    setAddState({ ok: "Item added to the draft cart." });
  };

  const submitLocalItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    addLocalItem({
      identifier: String(data.get("identifier") ?? ""),
      productId: String(data.get("productId") ?? "") || undefined,
      unitId: String(data.get("unitId") ?? "") || undefined,
    });
    event.currentTarget.reset();
  };

  const updateLocalLine = (lineId: string, patch: Pick<CheckoutLine, "quantity" | "actualUnitPrice">) => {
    setLineOrder(orderedLinesRef.current.map((line) => line.id === lineId ? { ...line, ...patch } : line));
  };

  const removeLocalLine = (lineId: string) => {
    setLineOrder(orderedLinesRef.current
      .filter((line) => line.id !== lineId)
      .map((line, position) => ({ ...line, position })));
    setInvalidLineIds((current) => {
      const next = new Set(current); next.delete(lineId); return next;
    });
  };

  const moveLine = (itemId: string, targetId: string): CheckoutLine[] => {
    const current = orderedLinesRef.current;
    const from = current.findIndex((line) => line.id === itemId);
    const to = current.findIndex((line) => line.id === targetId);
    if (from < 0 || to < 0 || from === to) return current;
    const container = cartLinesRef.current;
    if (container) {
      const positions = new Map<string, DOMRect>();
      for (const element of container.querySelectorAll<HTMLElement>(
        "[data-cart-line-id]",
      )) {
        const id = element.dataset.cartLineId;
        if (!id) continue;
        lineAnimationsRef.current.get(id)?.cancel();
        positions.set(id, element.getBoundingClientRect());
      }
      previousLinePositionsRef.current = positions;
    }
    const next = [...current];
    const [moved] = next.splice(from, 1);
    if (!moved) return current;
    next.splice(to, 0, moved);
    setLineOrder(next);
    return next;
  };

  const lineAtPointer = (clientY: number): string | null => {
    const container = cartLinesRef.current;
    if (!container) return null;
    const elements = [
      ...container.querySelectorAll<HTMLElement>("[data-cart-line-id]"),
    ];
    if (elements.length === 0) return null;

    // Use normal layout heights rather than transformed rectangles. During a
    // FLIP animation, visual rectangles overlap and can otherwise trigger an
    // immediate reverse swap while the pointer has not moved.
    let top = container.getBoundingClientRect().top;
    for (const element of elements) {
      const id = element.dataset.cartLineId;
      const midpoint = top + element.offsetHeight / 2;
      if (clientY < midpoint) return id ?? null;
      top += element.offsetHeight;
    }
    return elements.at(-1)?.dataset.cartLineId ?? null;
  };

  const saveLineOrder = (next: CheckoutLine[]) => {
    setLineOrder(next.map((line, position) => ({ ...line, position })));
    setReorderState({});
  };

  const moveLineByKeyboard = (itemId: string, direction: -1 | 1) => {
    const current = orderedLinesRef.current;
    const index = current.findIndex((line) => line.id === itemId);
    const target = current[index + direction];
    if (index < 0 || !target) return;
    saveLineOrder(moveLine(itemId, target.id));
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
      <section>
        <Card className="mb-4 p-4">
          <p className="eyebrow mb-4">{t("checkout.addItems")}</p>
          <form ref={scannerFormRef} onSubmit={submitLocalItem}>
            <Field
              label={
                <HelpTerm description={t("term.trackingHelp")}>
                  {t("checkout.scanItem")}
                </HelpTerm>
              }
              hint={t("checkout.scanHint")}
            >
              <ScannerInput
                name="identifier"
                autoFocus
                autoComplete="off"
                defaultValue={initialIdentifier}
                placeholder={t("checkout.scanPlaceholder")}
                onScan={() => scannerFormRef.current?.requestSubmit()}
              />
            </Field>
            <Button className="mt-3" type="submit">
              {t("checkout.addScanned")}
            </Button>
          </form>
          <div className="my-4 border-t border-rule" />
          <div className="grid gap-4 sm:grid-cols-2">
            <form onSubmit={submitLocalItem}>
              <Field
                label={t("checkout.bulkProduct")}
                hint={t("checkout.manualAlternative")}
              >
                <CheckoutProductCombobox products={quantityProducts} />
              </Field>
              <Button className="mt-3" type="submit" variant="ghost">
                {t("products.add")}
              </Button>
            </form>
            <form onSubmit={submitLocalItem}>
              <Field
                label={t("checkout.serialItem")}
                hint={t("checkout.chooseExact")}
              >
                <CheckoutUnitCombobox units={units} />
              </Field>
              <Button className="mt-3" type="submit" variant="ghost">
                {t("checkout.addUnit")}
              </Button>
            </form>
          </div>
          <Message state={addState} />
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <p className="eyebrow">
              {t("checkout.cart", {
                count: orderedLines.length,
                kind: t(
                  orderedLines.length === 1
                    ? "checkout.line"
                    : "checkout.lines",
                ),
              })}
            </p>
            <DiscardDraftControl
              cartId={cart.id}
              itemCount={orderedLines.length}
              hasTradeIn={Boolean(cart.tradeInDraft)}
              onDiscard={discardLocalDraft}
            />
          </div>
          {orderedLines.length === 0 ? (
            <p className="px-5 py-12 text-center text-[13px] text-graphite">
              {t("checkout.empty")}
            </p>
          ) : (
            <div ref={cartLinesRef}>
              {orderedLines.map((line) => (
                <CartLineEditor
                  key={line.id}
                  line={line}
                  dragging={draggingId === line.id}
                  dragDisabled={
                    orderedLines.length < 2
                  }
                  onChange={updateLocalLine}
                  onRemove={removeLocalLine}
                  onValidityChange={handleLineValidity}
                  staffMinimumPrice={role === 'STAFF'
                    ? Math.max(0, line.listUnitPrice - line.staffMaxDiscount)
                    : null}
                  isEmi={isEmi}
                  dragProps={{
                    "aria-label": t("checkout.reorderItem", {
                      product: line.productName,
                    }),
                    title: t("checkout.dragToReorder"),
                    onPointerDown: (event) => {
                      if (
                        orderedLines.length < 2 ||
                        event.button !== 0 ||
                        (event.target as HTMLElement).closest(
                          "input, button, select, textarea, a, label",
                        )
                      )
                        return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      draggingIdRef.current = line.id;
                      setDraggingId(line.id);
                      setReorderState({});
                    },
                    onPointerMove: (event) => {
                      const activeId = draggingIdRef.current;
                      if (!activeId) return;
                      const target = lineAtPointer(event.clientY);
                      if (target) moveLine(activeId, target);
                    },
                    onPointerUp: (event) => {
                      if (!draggingIdRef.current) return;
                      if (
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      ) {
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                      }
                      draggingIdRef.current = null;
                      setDraggingId(null);
                      saveLineOrder(orderedLinesRef.current);
                    },
                    onPointerCancel: () => {
                      draggingIdRef.current = null;
                      setDraggingId(null);
                    },
                    onKeyDown: (event) => {
                      if (
                        orderedLines.length < 2 ||
                        event.target !== event.currentTarget
                      )
                        return;
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveLineByKeyboard(line.id, -1);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveLineByKeyboard(line.id, 1);
                      }
                    },
                  }}
                />
              ))}
            </div>
          )}
          {(reorderState.error || reorderState.ok) && (
            <div className="border-t border-rule px-4 pb-3">
              <Message state={reorderState} />
            </div>
          )}
        </Card>
      </section>

      <aside>
        <form action={completeAction}>
          <input type="hidden" name="cartId" value={cart.id} />
          <input type="hidden" name="idempotencyKey" value={checkoutKey} />
          <input type="hidden" name="localCartLines" value={JSON.stringify(orderedLines.map((line) => ({
            clientId: line.id,
            productId: line.productId,
            unitId: line.unitId,
            quantity: line.quantity,
            actualUnitPrice: line.actualUnitPrice,
          })))} />
          <Card className="p-4">
            <p className="eyebrow mb-4">{t("checkout.customerPayment")}</p>
            <div className="space-y-4">
              <Field label={t("checkout.saleType")}>
                <Select name="saleMode" value={saleMode} onChange={(event) => setSaleMode(event.target.value as "CASH" | "EMI")}>
                  <option value="CASH">{t("checkout.regularSale")}</option>
                  <option value="EMI">{t("checkout.shopManagedEmi")}</option>
                </Select>
              </Field>
              <Field
                label={t("common.customer")}
                hint={t("checkout.customerHint")}
                error={regularErrors.customerId ? message(regularErrors.customerId) : undefined}
              >
                <CustomerCombobox
                  customers={customers}
                  value={selectedCustomerId}
                  onChange={chooseCustomer}
                />
              </Field>
              {isEmi && (
                <div className="rounded-[3px] border border-blue-300 bg-blue-50/60 p-3">
                  <p className="mb-3 text-[13px] font-semibold">{t("checkout.emiPlan")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("checkout.term")} error={emiErrors.termMonths ? message(emiErrors.termMonths) : undefined}>
                      <Select name="emiTermMonths" value={emiTerm} onChange={(event) => { setEmiTerm(Number(event.target.value) as 3 | 6 | 9 | 12); clearEmiError('termMonths'); }}>
                        {[3, 6, 9, 12].map((term) => <option key={term} value={term}>{t("checkout.months", { count: term })}</option>)}
                      </Select>
                    </Field>
                    <Field label={t("checkout.optionalDownPayment")} error={emiErrors.downPayment ? message(emiErrors.downPayment) : undefined}>
                      <Input name="emiDownPayment" inputMode="numeric" step="1" value={emiDownPayment} onChange={(event) => { setEmiDownPayment(event.target.value); clearEmiError('downPayment'); }} placeholder="0" />
                    </Field>
                    <Field label={t("checkout.firstInstallmentDate")} hint={t("checkout.firstInstallmentHint")} error={emiErrors.firstDueDate ? message(emiErrors.firstDueDate) : undefined}>
                      <Input name="emiFirstDueDate" type="date" min={today} max={maxEmiDueDate} value={emiFirstDueDate} onChange={(event) => { setEmiFirstDueDate(event.target.value); clearEmiError('firstDueDate'); }} />
                    </Field>
                    <Field label={t("checkout.identificationType")} error={emiErrors.identificationType ? message(emiErrors.identificationType) : undefined}>
                      <Select name="identificationType" value={identificationType} onChange={(event) => { setIdentificationType(event.target.value as typeof identificationType); clearEmiError('identificationType'); }}>
                        <option value="">{t("checkout.chooseIdentification")}</option>
                        <option value="NID">{t("checkout.nid")}</option>
                        <option value="PASSPORT">{t("checkout.passport")}</option>
                        <option value="BIRTH_CERTIFICATE">{t("checkout.birthCertificate")}</option>
                      </Select>
                    </Field>
                    <Field label={t("checkout.identificationNumber")} error={emiErrors.identificationNumber ? message(emiErrors.identificationNumber) : undefined}>
                      <Input name="identificationNumber" value={identificationNumber} onChange={(event) => { setIdentificationNumber(event.target.value); clearEmiError('identificationNumber'); }} placeholder={t("checkout.documentNumberPlaceholder")} />
                    </Field>
                  </div>
                  {!selectedCustomerId && <p className="mt-2 text-[12px] text-out">{t("checkout.savedCustomerRequiredForEmi")}</p>}
                  <p className="mt-2 text-[12px] text-graphite">{t("checkout.emiPriceHelp")}</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Field label={isEmi ? t("checkout.downPaymentMethod") : t("checkout.paymentMethod")}>
                  {!isEmi && paymentStatus === "UNPAID" ? (
                    <>
                      <Select value="" disabled aria-label={t("checkout.paymentMethod")}>
                        <option value="">{t("checkout.noPaymentMethodUnpaid")}</option>
                      </Select>
                      <input type="hidden" name="paymentMethod" value="OTHER" />
                    </>
                  ) : (
                    <Select
                      name="paymentMethod"
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                    >
                      {(
                        [
                          "CASH",
                          "CARD",
                          "MOBILE_BANKING",
                          "BANK_TRANSFER",
                          "MIXED",
                          "OTHER",
                        ] as PaymentMethod[]
                      ).map((value) => (
                        <option key={value} value={value}>
                          {domainLabel(t, value)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {isEmi
                  ? <input type="hidden" name="paymentStatus" value="UNPAID" />
                  : <Field label={t("checkout.paymentStatus")}>
                      <Select name="paymentStatus" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value as PaymentStatus); setRegularErrors({}); }}>
                        {(["PAID", "UNPAID"] as PaymentStatus[]).map((value) => (
                          <option key={value} value={value}>{domainLabel(t, value)}</option>
                        ))}
                      </Select>
                    </Field>}
              </div>
              {role === "STAFF" ? (
                null
              ) : cart.tradeInDraft ? (
                <div>
                  <p className="eyebrow mb-1.5">{t("checkout.tradeInCredit")}</p>
                  <p className="mb-2 text-[11px] text-graphite">{t("checkout.tradeInDraftHelp")}</p>
                  <div className="rounded-[3px] border border-rule bg-plate/30 p-3 text-[12px]">
                    <p className="font-semibold">{tradeInProduct?.name ?? t("common.product")} · <span className="tnum">{cart.tradeInDraft.serialNo}</span></p>
                    <p className="mt-1 text-graphite">{cart.tradeInDraft.sellerName} · {formatBDT(cart.tradeInDraft.acquisitionValue)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/stock/used-intake?cart=${cart.id}`} className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[13px] hover:bg-plate">
                        {t("checkout.editTradeIn")}
                      </Link>
                      <Button type="button" variant="danger" onClick={() => setConfirmingTradeInRemoval(true)} disabled={clearingTradeIn}>
                        {t("checkout.removeTradeIn")}
                      </Button>
                    </div>
                  </div>
                  <Message state={clearTradeInState} />
                </div>
              ) : (
                <div>
                  <p className="eyebrow mb-1.5">{t("checkout.tradeInCredit")}</p>
                  <p className="mb-2 text-[11px] text-graphite">{t("checkout.tradeInHelp")}</p>
                  <Link href={`/stock/used-intake?cart=${cart.id}`} className="mb-2 inline-flex h-9 items-center rounded-[3px] border border-teal-700 bg-teal-700 px-3 text-[13px] font-medium text-white transition-colors hover:border-teal-800 hover:bg-teal-800">
                    {t("checkout.prepareTradeIn")}
                  </Link>
                </div>
              )}
              {tradeInCashPayout > 0 ? (
                <Field label={t("checkout.tradeInPayoutMethod")} hint={t("checkout.tradeInPayoutHelp", { amount: formatBDT(tradeInCashPayout) })}>
                  <Select
                    name="tradeInPayoutMethod"
                    value={tradeInPayoutMethod}
                    onChange={(event) => setTradeInPayoutMethod(event.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((value) => (
                      <option key={value} value={value}>{domainLabel(t, value)}</option>
                    ))}
                  </Select>
                </Field>
              ) : <input type="hidden" name="tradeInPayoutMethod" value={tradeInPayoutMethod} />}
              <Field label={t("common.reference")}>
                <Input
                  name="reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  maxLength={100}
                />
              </Field>
              <Field label={t("checkout.invoiceNote")}>
                <Textarea name="note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
              </Field>
            </div>

            <div className="my-5 border-t border-rule" />
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt>{t("checkout.listSubtotal")}</dt>
                <dd className="tnum">{formatBDT(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("checkout.priceAdjustment")}</dt>
                <dd className={`tnum font-medium ${priceAdjustment > 0 ? "text-ok" : priceAdjustment < 0 ? "text-out" : "text-graphite"}`}>
                  {priceAdjustment > 0 ? "+" : ""}{formatBDT(priceAdjustment)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-rule pt-2 text-[16px] font-semibold">
                <dt>{isEmi ? t("emi.total") : t("common.total")}</dt>
                <dd className="tnum">{formatBDT(total)}</dd>
              </div>
              {tradeInCredit > 0 && (
                <>
                  <div className="flex justify-between text-[13px] text-out">
                    <dt>{t("checkout.tradeInCredit")}</dt>
                    <dd className="tnum">−{formatBDT(tradeInCredit)}</dd>
                  </div>
                  {!isEmi && <div className="flex justify-between border-t border-rule pt-2 text-[16px] font-semibold">
                    <dt>{t("checkout.amountDue")}</dt>
                    <dd className="tnum">{formatBDT(amountDue)}</dd>
                  </div>}
                  {tradeInCashPayout > 0 && (
                    <div className="flex justify-between text-[13px] font-semibold text-out">
                      <dt>{t("checkout.tradeInCashPayout")}</dt>
                      <dd className="tnum">{formatBDT(tradeInCashPayout)}</dd>
                    </div>
                  )}
                </>
              )}
              {isEmi && downPayment > 0 && (
                <div className="flex justify-between text-[13px] text-out">
                  <dt>{t("checkout.downPayment")}</dt><dd className="tnum">−{formatBDT(downPayment)}</dd>
                </div>
              )}
              {isEmi && (
                <div className="flex justify-between border-t border-rule pt-2 text-[16px] font-semibold">
                  <dt>{t("checkout.financedBalance")}</dt><dd className="tnum">{formatBDT(amountDue)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 grid gap-2">
              <Button
                type="button"
                onClick={requestCheckoutConfirmation}
                disabled={
                  checkingOut ||
                  hasInvalidLines ||
                  orderedLines.length === 0 ||
                  !checkoutKey ||
                  (isEmi && !selectedCustomerId)
                }
              >
                {checkingOut
                  ? t("checkout.completing")
                  : t("checkout.complete")}
              </Button>
            </div>
            {hasInvalidLines && (
              <p className="mt-2 text-[11px] font-medium text-out">
                {t('checkout.fixInvalidLines')}
              </p>
            )}
            <Message
              state={checkoutState}
            />
            <p className="mt-3 text-[11px] text-graphite">
              {t("checkout.transactionHelp")}
            </p>

            {confirmingTradeInRemoval && cart.tradeInDraft && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !clearingTradeIn) {
                    setConfirmingTradeInRemoval(false);
                  }
                }}
              >
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="remove-trade-in-title"
                  aria-describedby="remove-trade-in-description"
                  className="w-full max-w-md rounded-[3px] border border-rule bg-card p-5 shadow-xl"
                >
                  <h2 id="remove-trade-in-title" className="text-[17px] font-semibold">
                    {t("checkout.removeTradeInTitle")}
                  </h2>
                  <p id="remove-trade-in-description" className="mt-2 text-[13px] text-graphite">
                    {t("checkout.removeTradeInDescription")}
                  </p>
                  <p className="mt-3 rounded-[3px] border border-rule bg-plate/30 p-3 text-[12px]">
                    <span className="font-semibold">{tradeInProduct?.name ?? t("common.product")}</span>
                    <span className="tnum ml-2">{cart.tradeInDraft.serialNo}</span>
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setConfirmingTradeInRemoval(false)} disabled={clearingTradeIn}>
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" variant="danger" formAction={clearTradeInAction} disabled={clearingTradeIn}>
                      {clearingTradeIn ? t("common.saving") : t("checkout.yesRemoveTradeIn")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {confirmingCheckout && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-2 sm:p-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !checkingOut) {
                    setConfirmingCheckout(false);
                  }
                }}
              >
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="complete-sale-title"
                  aria-describedby="complete-sale-description"
                  className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[3px] border border-rule bg-card shadow-xl sm:max-h-[calc(100dvh-2rem)]"
                >
                  <div className="shrink-0 border-b border-rule px-4 py-3 sm:px-5">
                    <h2 id="complete-sale-title" className="text-[17px] font-semibold">
                      {t("checkout.invoicePreview")}
                    </h2>
                    <p id="complete-sale-description" className="mt-1 text-[12px] text-graphite">
                      {t("checkout.invoicePreviewHelp")}
                    </p>
                  </div>

                  <div
                    className="invoice-preview-viewport contextual-scroll-area scrollbar-active min-h-0 overflow-y-auto bg-plate/40 p-3 sm:p-5"
                    role="region"
                    aria-label={t("checkout.invoicePreviewScrollArea")}
                    tabIndex={0}
                  >
                    <article className="mx-auto max-w-3xl rounded-[3px] border border-rule bg-card p-4 sm:p-6">
                      <header className="flex items-start justify-between gap-4 border-b border-ink pb-4">
                        <div>
                          <h3 className="sr-only">{shopName}</h3>
                          <Image
                            src={SHOP_LOGO_DATA_URI}
                            alt={shopName}
                            width={600}
                            height={400}
                            unoptimized
                            className="h-auto w-[120px] sm:w-[150px]"
                          />
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-graphite">
                            {t("checkout.invoicePreview")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[16px] font-semibold">{isEmi ? "EMI INVOICE" : "INVOICE"}</p>
                          <p className="mt-1 text-[11px] text-graphite">{t("checkout.invoiceNumberAfterSale")}</p>
                        </div>
                      </header>

                      <section className="grid gap-3 border-b border-rule py-4 text-[12px] sm:grid-cols-2">
                        <div>
                          <p className="eyebrow">{t("common.customer")}</p>
                          <p className="mt-1 font-semibold">{selectedCustomer?.name ?? t("checkout.walkIn")}</p>
                          {selectedCustomer?.phone && <p className="tnum text-graphite">{selectedCustomer.phone}</p>}
                        </div>
                        <div className="sm:text-right">
                          <p className="eyebrow">{t("checkout.paymentMethod")}</p>
                          <p className="mt-1 font-semibold">
                            {!isEmi && paymentStatus === "UNPAID"
                              ? domainLabel(t, paymentStatus)
                              : `${domainLabel(t, paymentMethod)} · ${isEmi ? t("checkout.emiPlan") : domainLabel(t, paymentStatus)}`}
                          </p>
                          {reference && <p className="text-graphite">{t("common.reference")}: {reference}</p>}
                        </div>
                      </section>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-[12px]">
                          <thead className="bg-plate text-left">
                            <tr>
                              <th className="px-2 py-2">{t("checkout.previewItem")}</th>
                              <th className="px-2 py-2 text-center">{t("common.quantity")}</th>
                              <th className="px-2 py-2 text-right">{t("checkout.previewUnitPrice")}</th>
                              <th className="px-2 py-2 text-right">{t("common.total")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orderedLines.map((line) => (
                              <tr key={line.id} className="border-b border-rule align-top">
                                <td className="px-2 py-2.5">
                                  <p className="font-semibold">{line.productName}</p>
                                  <p className="tnum text-[10px] text-graphite">
                                    {line.sku}{line.serialNo ? ` · ${t("checkout.serialImei")}: ${line.serialNo}` : ""}
                                  </p>
                                </td>
                                <td className="tnum px-2 py-2.5 text-center">{line.quantity}</td>
                                <td className="tnum px-2 py-2.5 text-right">{formatBDT(line.actualUnitPrice)}</td>
                                <td className="tnum px-2 py-2.5 text-right">{formatBDT(line.actualUnitPrice * line.quantity)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {cart.tradeInDraft && (
                        <section className="mt-4 border border-rule bg-plate/50 p-3 text-[12px]">
                          <p className="eyebrow">{t("checkout.previewTradeInDevice")}</p>
                          <div className="mt-2 flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                            <div>
                              <p className="font-semibold">
                                {tradeInProduct?.name ?? t("common.product")}
                              </p>
                              <p className="tnum mt-0.5 text-[10px] text-graphite">
                                {tradeInProduct?.sku ?? "—"} · {t("checkout.serialImei")}: {cart.tradeInDraft.serialNo}
                              </p>
                              <p className="mt-1 text-[11px] text-graphite">
                                {t("used.grade")}: {tradeInGrade}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="eyebrow">{t("checkout.tradeInCredit")}</p>
                              <p className="tnum mt-1 font-semibold text-out">
                                {formatBDT(cart.tradeInDraft.acquisitionValue)}
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 text-[10px] text-graphite">
                            {t("checkout.previewTradeInHelp")}
                          </p>
                        </section>
                      )}

                      <section className="ml-auto mt-4 w-full max-w-sm space-y-2 text-[12px]">
                        <div className="flex justify-between gap-4">
                          <span>{t("checkout.listSubtotal")}</span>
                          <span className="tnum">{formatBDT(subtotal)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>{t("checkout.priceAdjustment")}</span>
                          <span className={`tnum ${priceAdjustment > 0 ? "text-ok" : priceAdjustment < 0 ? "text-out" : ""}`}>
                            {priceAdjustment > 0 ? "+" : ""}{formatBDT(priceAdjustment)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-ink pt-2 text-[16px] font-semibold">
                          <span>{isEmi ? t("emi.total") : t("common.total")}</span>
                          <span className="tnum">{formatBDT(total)}</span>
                        </div>
                        {tradeInCredit > 0 && (
                          <div className="flex justify-between gap-4 text-out">
                            <span>{t("checkout.tradeInCredit")}</span>
                            <span className="tnum">−{formatBDT(tradeInCredit)}</span>
                          </div>
                        )}
                        {tradeInCashPayout > 0 && (
                          <div className="flex justify-between gap-4 font-semibold text-out">
                            <span>{t("checkout.tradeInCashPayout")}</span>
                            <span className="tnum">{formatBDT(tradeInCashPayout)}</span>
                          </div>
                        )}
                        {isEmi && (
                          <>
                            <div className="flex justify-between gap-4">
                              <span>{t("checkout.optionalDownPayment")}</span>
                              <span className="tnum">{formatBDT(downPayment)}</span>
                            </div>
                            <div className="flex justify-between gap-4 font-semibold">
                              <span>{t("checkout.financedBalance")}</span>
                              <span className="tnum">{formatBDT(amountDue)}</span>
                            </div>
                            <p className="text-right text-[11px] text-graphite">
                              {t("checkout.previewEmiTerm", { count: emiTerm })}{emiFirstDueDate ? ` · ${previewDate(emiFirstDueDate)}` : ""}
                            </p>
                          </>
                        )}
                        {!isEmi && tradeInCredit > 0 && (
                          <div className="flex justify-between gap-4 font-semibold">
                            <span>{t("checkout.previewAmountDue")}</span>
                            <span className="tnum">{formatBDT(amountDue)}</span>
                          </div>
                        )}
                      </section>

                      {note && (
                        <div className="mt-4 border-t border-rule pt-3 text-[11px] text-graphite">
                          <span className="font-semibold">{t("checkout.invoiceNote")}:</span> {note}
                        </div>
                      )}
                    </article>
                  </div>

                  <div className="shrink-0 border-t border-rule bg-card px-4 py-3 sm:px-5">
                    <p className="mb-3 text-[11px] text-out">{t("checkout.cannotUndo")}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmingCheckout(false)}
                      disabled={checkingOut}
                      autoFocus
                    >
                      {t("checkout.keepEditing")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={checkingOut || hasInvalidLines}
                    >
                      {checkingOut
                        ? t("checkout.completing")
                        : t("checkout.yesComplete")}
                    </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </form>

        <details className="mt-4 rounded-[3px] border border-rule bg-card">
          <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium">
            {t("checkout.newCustomer")}
          </summary>
          <div className="border-t border-rule p-4">
            <CreateCustomerForm onCreated={chooseCustomer} stacked />
          </div>
        </details>
      </aside>
    </div>
  );
}
