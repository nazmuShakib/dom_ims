import { setLocaleAction } from '@/actions/locale';
import type { Locale } from '@/lib/i18n/config';
import { translate } from '@/lib/i18n/messages';

export function LanguageSwitcher({
  locale,
  compact = false,
  showBoth = false,
}: {
  locale: Locale;
  compact?: boolean;
  showBoth?: boolean;
}) {
  const next = locale === 'en' ? 'bn' : 'en';
  if (showBoth) {
    return (
      <div className="inline-flex rounded-[3px] border border-rule bg-card p-0.5" role="group" aria-label={translate(locale, 'language.switchTo')}>
        {(['en', 'bn'] as const).map((option) => {
          const selected = locale === option;
          return (
            <form action={setLocaleAction} key={option}>
              <input type="hidden" name="locale" value={option} />
              <button
                type="submit"
                aria-pressed={selected}
                className={`${compact ? 'h-8 px-2.5 text-[11px]' : 'h-9 px-3.5 text-[12px]'} inline-flex items-center justify-center rounded-[2px] font-medium transition-colors ${selected ? 'bg-signal text-white' : 'bg-card text-ink hover:bg-plate'}`}
              >
                {translate(locale, option === 'en' ? 'language.english' : 'language.bengali')}
                {selected && <span className="ml-1.5" aria-hidden="true">✓</span>}
              </button>
            </form>
          );
        })}
      </div>
    );
  }
  return (
    <form action={setLocaleAction}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        aria-label={translate(locale, 'language.switchTo')}
        className={`${compact ? 'h-8 px-2.5 text-[11px]' : 'h-9 px-3 text-[12px]'} inline-flex items-center justify-center rounded-[3px] border border-rule bg-card font-medium text-ink hover:bg-plate`}
      >
        {translate(locale, next === 'bn' ? 'language.bengali' : 'language.english')}
      </button>
    </form>
  );
}
