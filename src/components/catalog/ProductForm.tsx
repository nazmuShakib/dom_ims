'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import type { Brand, Category, Product } from '@/domain/types';
import { parseBDT, toTaka } from '@/lib/money';
import type { ActionState } from '@/actions/catalog';
import { Button, Card, Field, HelpTerm, Input, MonoInput, Select, Textarea } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { productStaffDiscountFieldsSchema } from '@/schemas';
import { generateNumericProductBarcode } from '@/lib/product-barcode';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function ProductForm({
  action,
  categories,
  brands,
  product,
  canManageStaffDiscount = false,
}: {
  action: Action;
  categories: Category[];
  brands: Brand[];
  product?: Product;
  canManageStaffDiscount?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const { t, message } = useI18n();
  const err = (k: string) => state.fieldErrors?.[k];
  const editing = Boolean(product);
  const [staffDiscountError, setStaffDiscountError] = useState<string>();
  const barcodeRef = useRef<HTMLInputElement>(null);

  const validateStaffDiscount = (value: string, salePrice?: string): boolean => {
    if (!canManageStaffDiscount) return true;
    const result = productStaffDiscountFieldsSchema.safeParse({ staffMaxDiscount: value });
    let nextError = result.success ? undefined : result.error.issues[0]?.message;
    if (result.success && salePrice !== undefined) {
      try {
        if (result.data.staffMaxDiscount > parseBDT(salePrice || '0')) {
          nextError = 'The STAFF discount cannot exceed this product’s selling price.';
        }
      } catch {
        // The selling-price field reports its own validation error.
      }
    }
    setStaffDiscountError(nextError);
    return !nextError;
  };

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(event) => {
        if (!canManageStaffDiscount) return;
        const form = event.currentTarget;
        const input = form.elements.namedItem('staffMaxDiscount');
        const salePrice = form.elements.namedItem('defaultSalePrice');
        if (input instanceof HTMLInputElement && !validateStaffDiscount(
          input.value,
          salePrice instanceof HTMLInputElement ? salePrice.value : undefined,
        )) {
          event.preventDefault();
        }
      }}
    >
      {product && <input type="hidden" name="id" value={product.id} />}

      {state.error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {message(state.error)}
        </div>
      )}

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-4">{t('products.identity')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={<HelpTerm description={t('term.productCodeHelp')}>{t('term.productCode')}</HelpTerm>}
            error={err('sku')}
            hint={t('products.codeUnique')}
          >
            <MonoInput
              name="sku"
              required
              defaultValue={product?.sku}
              placeholder="SAM-A55-8-256"
            />
          </Field>

          <Field
            label={t('common.barcode')}
            error={err('barcode')}
            hint={t('products.generatedBarcodeHelp')}
          >
            <div className="flex gap-2">
              <MonoInput
                ref={barcodeRef}
                name="barcode"
                defaultValue={product?.barcode ?? ''}
              />
              <Button
                type="button"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  if (!barcodeRef.current) return;
                  barcodeRef.current.value = generateNumericProductBarcode();
                  barcodeRef.current.focus();
                  barcodeRef.current.select();
                }}
              >
                {t('products.generateBarcode')}
              </Button>
            </div>
          </Field>

          <div className="sm:col-span-2">
            <Field label={t('common.name')} error={err('name')}>
              <Input
                name="name"
                required
                defaultValue={product?.name}
                placeholder="Samsung Galaxy A55 (8/256GB)"
              />
            </Field>
          </div>

          <Field label={t('products.modelNumber')} error={err('model')}>
            <MonoInput name="model" defaultValue={product?.model ?? ''} placeholder="SM-A556E" />
          </Field>

          <Field label={t('common.category')} error={err('categoryId')}>
            <Select name="categoryId" required defaultValue={product?.categoryId ?? ''}>
              <option value="" disabled>
                {t('products.chooseCategory')}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('common.brand')} error={err('brandId')}>
            <Select name="brandId" defaultValue={product?.brandId ?? ''}>
              <option value="">{t('products.noBrand')}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field label={t('common.description')} error={err('description')}>
              <Textarea name="description" defaultValue={product?.description ?? ''} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-4">{t('products.counting')}</p>

        {editing ? (
          /* Changing tracking type on a product with history would orphan its units
             and break the ledger invariant. It's fixed at creation. (PLAN.md §5.3) */
          <div className="rounded-[3px] border border-rule bg-plate/60 px-3 py-2.5">
            <p className="text-[13px] font-medium">
              {product!.trackingType === 'SERIAL'
                ? t('products.serialRecord')
                : t('products.bulkRecord')}
            </p>
            <p className="mt-1 text-[12px] text-graphite">
              {t('products.trackingLocked')}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer gap-3 rounded-[3px] border border-rule p-3 hover:bg-plate/50 has-checked:border-signal has-checked:bg-signal-wash">
              <input
                type="radio"
                name="trackingType"
                value="SERIAL"
                defaultChecked
                className="mt-0.5"
              />
              <span>
                <span className="block text-[13px] font-medium">{t('products.serialTracking')}</span>
                <span className="mt-0.5 block text-[12px] text-graphite">
                  {t('products.serialTrackingHelp')}
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-[3px] border border-rule p-3 hover:bg-plate/50 has-checked:border-signal has-checked:bg-signal-wash">
              <input type="radio" name="trackingType" value="QUANTITY" className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-medium">{t('products.bulkTracking')}</span>
                <span className="mt-0.5 block text-[12px] text-graphite">
                  {t('products.bulkTrackingHelp')}
                </span>
              </span>
            </label>
          </div>
        )}
      </Card>

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-1">{t('products.defaultPrices')}</p>
        <p className="mb-4 text-[12px] text-graphite">
          {t('products.defaultPricesHelp')}
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('products.costPrice')} error={err('defaultCostPrice')}>
            <MonoInput
              name="defaultCostPrice"
              inputMode="decimal"
              defaultValue={product ? toTaka(product.defaultCostPrice) : ''}
              placeholder="42000"
            />
          </Field>

          <Field label={t('products.sellingPrice')} error={err('defaultSalePrice')}>
            <MonoInput
              name="defaultSalePrice"
              inputMode="decimal"
              defaultValue={product ? toTaka(product.defaultSalePrice) : ''}
              placeholder="47500"
            />
          </Field>

          <Field
            label={t('products.reorderPoint')}
            error={err('reorderPoint')}
            hint={t('products.reorderHint')}
          >
            <MonoInput
              name="reorderPoint"
              inputMode="numeric"
              defaultValue={product?.reorderPoint ?? 5}
            />
          </Field>

          {canManageStaffDiscount && (
            <Field
              label={t('products.staffMaxDiscount')}
              error={staffDiscountError ?? (err('staffMaxDiscount') ? message(err('staffMaxDiscount')!) : undefined)}
              hint={t('products.staffMaxDiscountHelp')}
            >
              <MonoInput
                name="staffMaxDiscount"
                inputMode="decimal"
                defaultValue={product ? toTaka(product.staffMaxDiscount) : '0'}
                placeholder="0"
                onChange={(event) => {
                  if (staffDiscountError || err('staffMaxDiscount')) {
                    validateStaffDiscount(event.target.value, event.currentTarget.form?.defaultSalePrice?.value);
                  }
                }}
                onBlur={(event) => validateStaffDiscount(
                  event.target.value,
                  event.currentTarget.form?.defaultSalePrice?.value,
                )}
                aria-invalid={Boolean(staffDiscountError ?? err('staffMaxDiscount'))}
              />
            </Field>
          )}
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : editing ? t('common.saveChanges') : t('products.create')}
        </Button>
        <Link href={product ? `/products/${product.id}` : '/products'}>
          <Button type="button" variant="ghost">
            {t('common.cancel')}
          </Button>
        </Link>
      </div>
    </form>
  );
}
