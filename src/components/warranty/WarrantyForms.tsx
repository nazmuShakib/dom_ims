'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  addWarrantyNoteAction,
  createWarrantyClaimAction,
  resolveWarrantyClaimAction,
  recordWarrantyHandoverAction,
  transitionWarrantyClaimAction,
  updateSupplierWarrantyCaseAction,
  type WarrantyActionState,
} from '@/actions/warranty';
import { ScannerInput } from '@/components/search/ScannerInput';
import { Button, Card, Field, HelpTerm, Input, Select, Textarea } from '@/components/ui';
import {
  RMA_COVERAGES, RMA_CUSTODIES, RMA_STATUS_TRANSITIONS, SUPPLIER_WARRANTY_STATUSES,
  type RmaCoverage, type RmaCustody, type RmaStatus, type Supplier, type SupplierWarrantyCase, type User,
} from '@/domain/types';
import { useI18n } from '@/components/i18n/I18nProvider';
import { domainLabel } from '@/lib/i18n/domain';

function useKey(ok?: string) {
  const [key, setKey] = useState('pending');
  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => { if (ok) setKey(crypto.randomUUID()); }, [ok]);
  return key;
}
function Feedback({ state }: { state: WarrantyActionState }) {
  const { message } = useI18n();
  if (!state.error && !state.ok) return null;
  return <p className={`mb-3 rounded-[3px] border px-3 py-2 text-[12px] ${state.error ? 'border-out/20 bg-out-wash text-out' : 'border-ok/20 bg-ok-wash text-ok'}`}>{message((state.error ?? state.ok)!)}</p>;
}

export function WarrantyLookup({ initialSerial = '' }: { initialSerial?: string }) {
  const { t } = useI18n();
  return (
    <form method="get" action="/warranty/new" className="flex max-w-xl items-end gap-2">
      <div className="flex-1"><Field label={<HelpTerm description={t('term.trackingHelp')}>{t('warranty.lookup')}</HelpTerm>}><ScannerInput name="serial" defaultValue={initialSerial} autoFocus required placeholder={t('stock.scanEnter')} /></Field></div>
      <Button type="submit">{t('warranty.lookUp')}</Button>
    </form>
  );
}

export function WarrantyIntakeForm({ serialNo, customerName, customerPhone }: { serialNo: string; customerName: string | null; customerPhone: string | null }) {
  const [state, action, pending] = useActionState(createWarrantyClaimAction, {});
  const { t } = useI18n();
  const key = useKey(state.ok);
  return (
    <form action={action}>
      <input type="hidden" name="serialNo" value={serialNo} /><input type="hidden" name="idempotencyKey" value={key} />
      <Feedback state={state} />
      <Card className="mt-4 p-5"><p className="eyebrow mb-4">{t('warranty.intake')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('warranty.customerName')}><Input name="claimantName" defaultValue={customerName ?? ''} /></Field>
          <Field label={t('warranty.customerPhone')}><Input name="claimantPhone" defaultValue={customerPhone ?? ''} /></Field>
          <div className="sm:col-span-2"><Field label={t('warranty.reportedIssue')}><Textarea name="reportedIssue" required minLength={5} placeholder={t('warranty.issuePlaceholder')} /></Field></div>
          <div className="sm:col-span-2"><Field label={t('warranty.physicalCondition')} hint={t('warranty.conditionHint')}><Textarea name="physicalCondition" /></Field></div>
        </div>
        <Button className="mt-4" disabled={pending || key === 'pending'}>{pending ? t('warranty.opening') : t('warranty.open')}</Button>
      </Card>
    </form>
  );
}

export function WarrantyNoteForm({ claimId }: { claimId: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addWarrantyNoteAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><Field label={t('warranty.timelineNote')}><Textarea name="note" required /></Field><Button className="mt-2" variant="ghost" disabled={pending || key === 'pending'}>{t('warranty.addNote')}</Button></form>;
}

export function WarrantyHandoverForm({ claimId, status, custody }: { claimId: string; status: RmaStatus; custody: RmaCustody }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(recordWarrantyHandoverAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="expectedStatus" value={status} /><input type="hidden" name="expectedCustody" value={custody} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><Field label={t('warranty.newCustody')}><Select name="custody" required defaultValue=""> <option value="" disabled>{t('warranty.handoverDestination')}</option>{RMA_CUSTODIES.filter((value) => value !== custody).map((value) => <option key={value}>{domainLabel(t, value)}</option>)}</Select></Field><div className="mt-3"><Field label={t('warranty.handoverNote')}><Textarea name="note" required /></Field></div><Button className="mt-2" variant="ghost" disabled={pending || key === 'pending'}>{t('warranty.recordHandover')}</Button></form>;
}

export function WarrantyTransitionForm({ claimId, status, coverage, users }: { claimId: string; status: RmaStatus; coverage: RmaCoverage; users: User[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(transitionWarrantyClaimAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="expectedStatus" value={status} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><div className="grid gap-3 sm:grid-cols-2">
    <Field label={t('warranty.nextStatus')}><Select name="nextStatus" required>{RMA_STATUS_TRANSITIONS[status].map((value) => <option key={value}>{domainLabel(t, value)}</option>)}</Select></Field>
    <Field label={t('warranty.custody')}><Select name="custody" defaultValue=""><option value="">{t('warranty.keepCurrent')}</option>{RMA_CUSTODIES.map((value) => <option key={value}>{domainLabel(t, value)}</option>)}</Select></Field>
    <Field label={t('warranty.coverage')}><Select name="coverage" defaultValue={coverage}>{RMA_COVERAGES.map((value) => <option key={value}>{domainLabel(t, value)}</option>)}</Select></Field>
    <Field label={t('warranty.assignTo')}><Select name="assignedToId" defaultValue=""><option value="">{t('warranty.unassigned')}</option>{users.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
    <div className="sm:col-span-2"><Field label={t('warranty.reasonNote')}><Textarea name="note" required /></Field></div>
  </div><Button className="mt-3" disabled={pending || key === 'pending'}>{t('warranty.update')}</Button></form>;
}

export function WarrantyResolutionForm({ claimId, status }: { claimId: string; status: RmaStatus }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(resolveWarrantyClaimAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="expectedStatus" value={status} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><div className="grid gap-3 sm:grid-cols-2">
    <Field label={t('warranty.inventoryOutcome')}><Select name="outcome"><option value="RESTOCK">{t('warranty.restock')}</option><option value="WRITEOFF">{t('warranty.writeoff')}</option><option value="REPLACEMENT">{t('warranty.replacement')}</option></Select></Field>
    <Field label={t('warranty.replacementDevice')} hint={t('warranty.replacementHint')}><ScannerInput name="replacementSerial" /></Field>
    <div className="sm:col-span-2"><Field label={t('warranty.resolutionNote')}><Textarea name="note" required /></Field></div>
  </div><Button className="mt-3" disabled={pending || key === 'pending'}>{t('warranty.applyResolution')}</Button></form>;
}

export function SupplierWarrantyForm({ claimId, suppliers, value }: { claimId: string; suppliers: Supplier[]; value: SupplierWarrantyCase | null }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(updateSupplierWarrantyCaseAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><div className="grid gap-3 sm:grid-cols-2">
    <Field label={t('common.supplier')}><Select name="supplierId" required defaultValue={value?.supplierId ?? ''}><option value="" disabled>{t('warranty.chooseSupplier')}</option>{suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
    <Field label={t('warranty.supplierStatus')}><Select name="status" defaultValue={value?.status ?? 'DRAFT'}>{SUPPLIER_WARRANTY_STATUSES.map((status) => <option key={status}>{domainLabel(t, status)}</option>)}</Select></Field>
    <Field label={t('warranty.supplierCoverage')}><Select name="coverage" defaultValue={value?.coverage ?? 'UNKNOWN_PROOF_OF_PURCHASE'}>{RMA_COVERAGES.map((coverage) => <option key={coverage}>{domainLabel(t, coverage)}</option>)}</Select></Field>
    <Field label={t('warranty.supplierReference')}><Input name="reference" defaultValue={value?.reference ?? ''} /></Field>
    <div className="sm:col-span-2"><Field label={t('warranty.supplierResolution')}><Textarea name="resolution" defaultValue={value?.resolution ?? ''} /></Field></div>
  </div><Button className="mt-3" variant="ghost" disabled={pending || key === 'pending'}>{t('warranty.saveSupplier')}</Button></form>;
}

export function PrintButton() { const { t } = useI18n(); return <Button variant="ghost" type="button" onClick={() => window.print()} className="print:hidden">{t('warranty.printAcknowledgement')}</Button>; }
