import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { messages, translate } from '@/lib/i18n/messages';
import { translateActionMessage } from '@/lib/i18n/action-messages';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('English and Bengali interface', () => {
  it('keeps both dictionaries complete and interpolates values', () => {
    expect(Object.keys(messages.bn).sort()).toEqual(Object.keys(messages.en).sort());
    expect(translate('en', 'dashboard.days', { count: 30 })).toBe('30 days');
    expect(translate('bn', 'dashboard.days', { count: 30 })).toBe('30 দিন');
  });

  it('translates server-action notifications without changing English feedback', () => {
    expect(translateActionMessage('bn', 'A record with this name already exists.'))
      .toBe('এই নামে একটি রেকর্ড ইতিমধ্যে আছে।');
    expect(translateActionMessage('bn', 'Item added to the draft cart.'))
      .toBe('পণ্যটি খসড়া কার্টে যোগ হয়েছে।');
    expect(translateActionMessage('bn', 'No product or device number matches that identifier.'))
      .toBe('এই পরিচয় নম্বরের সঙ্গে মেলে এমন কোনো পণ্য বা ডিভাইস নম্বর পাওয়া যায়নি।');
    expect(translateActionMessage('bn', 'Received 2 × Phone into stock.'))
      .toBe('Phone পণ্যের 2টি স্টকে গ্রহণ করা হয়েছে।');
    expect(translateActionMessage('en', 'Item added to the draft cart.'))
      .toBe('Item added to the draft cart.');
  });

  it('persists a validated locale per user with a pre-login cookie fallback', () => {
    const schema = source('prisma/schema.prisma');
    const action = source('src/actions/locale.ts');
    const migration = source('prisma/migrations/20260802002000_add_user_locale/migration.sql');
    expect(schema).toMatch(/locale\s+String\s+@default\("en"\)/);
    expect(action).toContain('z.enum(LOCALES)');
    expect(action).toContain('prisma.user.update');
    expect(action).toContain('httpOnly: true');
    expect(migration).toContain('ADD COLUMN "locale"');
    expect(migration).toContain("CHECK (\"locale\" IN ('en', 'bn'))");
  });

  it('offers the switch in Settings and login without changing print data', () => {
    const settings = source('src/app/(dashboard)/settings/page.tsx');
    const login = source('src/app/login/page.tsx');
    const invoice = source('src/components/invoices/InvoiceView.tsx');
    const label = source('src/components/labels/StockLabelStudio.tsx');
    expect(settings).toContain('<LanguageSwitcher locale={locale}');
    expect(settings).toContain('showBoth');
    expect(source('src/components/i18n/LanguageSwitcher.tsx')).toContain('aria-pressed={selected}');
    expect(source('src/app/(dashboard)/layout.tsx')).toContain('ml-auto hidden md:block');
    expect(login).toContain('<LanguageSwitcher locale={locale}');
    expect(invoice).not.toContain('LanguageSwitcher');
    expect(label).toContain('<ProductLabel');
    expect(label).toContain('SKU: {product.sku}');
  });
});
