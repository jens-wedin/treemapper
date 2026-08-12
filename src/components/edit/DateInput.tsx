import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Qualifier } from '../../../lib/gedcomDate';
import { parseGedcomDate } from '../../../lib/gedcomDate';
import { MONTHS } from '../../lib/i18n/dictionaries';
import { t, getLanguage, formatGedcomDate } from '../../lib/i18n';
import { fromRaw, toRaw, RANGE_QUALIFIERS, type DateFieldState } from '../../lib/dateField';

/**
 * A date, entered as the parts it is actually made of.
 *
 * It used to be one text box labelled "Date (free text, e.g. ABT 1715)", which
 * is how `arbrå`, `17xx` and `4 juli 1814 el 1812` got into the database. The
 * parts are all optional above the year, because a genealogical date is very
 * often "March 1902" or just "1821", and a control that insists on a full date
 * would throw away what is actually known.
 *
 * The value passed in and out stays a GEDCOM string, so nothing downstream —
 * the schemas, the API, the export — needed to change.
 */
const QUALIFIER_LABEL: Record<Qualifier, string> = {
  exact: 'edit.dateExact', about: 'edit.dateAbout', estimated: 'edit.dateEstimated',
  calculated: 'edit.dateCalculated', before: 'edit.dateBefore', after: 'edit.dateAfter',
  between: 'edit.dateBetween', period: 'edit.datePeriod',
};
const QUALIFIER_ORDER = Object.keys(QUALIFIER_LABEL) as Qualifier[];

export default function DateInput({ id, value, onChange }: {
  id: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  const [state, setState] = useState<DateFieldState>(() => fromRaw(value));
  const [typing, setTyping] = useState(() => Boolean(fromRaw(value).text));

  /** One writer for both views, so the preview and the stored value cannot disagree. */
  function put(next: DateFieldState) {
    setState(next);
    onChange(toRaw(next));
  }

  const months = MONTHS[getLanguage()];
  const stored = toRaw(state);
  const unreadable = Boolean(state.text.trim()) && !parseGedcomDate(state.text);
  const isRange = RANGE_QUALIFIERS.includes(state.qualifier);

  const part = (
    key: 'fromDay' | 'fromMonth' | 'fromYear' | 'toDay' | 'toMonth' | 'toYear',
    label: string,
    kind: 'day' | 'month' | 'year',
  ) => (
    <div>
      {/* htmlFor + id, never a <label> wrapping the <select>: that would take
          the chosen option into the accessible name. */}
      <label htmlFor={`${id}-${key}`} className="block text-xs text-muted-foreground">{label}</label>
      {kind === 'month' ? (
        <select
          id={`${id}-${key}`}
          value={state[key]}
          disabled={unreadable}
          onChange={e => put({ ...state, [key]: e.target.value })}
          className="mt-1 h-9 w-36 rounded-md border bg-background px-2 text-sm disabled:bg-muted disabled:opacity-50"
        >
          <option value="">— {t('edit.dateNoMonth')}</option>
          {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
      ) : (
        <Input
          id={`${id}-${key}`}
          inputMode="numeric"
          value={state[key]}
          disabled={unreadable}
          onChange={e => put({ ...state, [key]: e.target.value.replace(/\D/g, '') })}
          className={`mt-1 ${kind === 'year' ? 'w-24' : 'w-16'}`}
        />
      )}
    </div>
  );

  return (
    <fieldset className="mt-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{t('edit.date')}</legend>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`${id}-qualifier`} className="block text-xs text-muted-foreground">
            {t('edit.dateQualifier')}
          </label>
          <select
            id={`${id}-qualifier`}
            value={state.qualifier}
            disabled={unreadable}
            onChange={e => put({ ...state, qualifier: e.target.value as Qualifier })}
            className="mt-1 h-9 w-36 rounded-md border bg-background px-2 text-sm disabled:bg-muted disabled:opacity-50"
          >
            {QUALIFIER_ORDER.map(q => <option key={q} value={q}>{t(QUALIFIER_LABEL[q])}</option>)}
          </select>
        </div>
        {part('fromDay', t('edit.day'), 'day')}
        {part('fromMonth', t('edit.month'), 'month')}
        {part('fromYear', t('edit.year'), 'year')}
      </div>

      {isRange && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {part('toDay', t('edit.dateEndDay'), 'day')}
          {part('toMonth', t('edit.dateEndMonth'), 'month')}
          {part('toYear', t('edit.dateEndYear'), 'year')}
        </div>
      )}

      {/* Announced, because the whole point is that you can see what a choice
          of "Between" plus two years is about to become. */}
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-muted-foreground">
        {stored && (
          <>
            {t('edit.dateStored')}: <code className="font-mono">{stored}</code>
            {' · '}
            {t('edit.dateReads')}: {formatGedcomDate(stored)}
          </>
        )}
      </p>

      {unreadable && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('edit.dateKeptAsWritten')}</p>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1 h-auto px-1 py-0 text-xs"
        aria-expanded={typing}
        onClick={() => {
          // Opening it seeds the box with what is stored, so you edit the real
          // value; closing it hands the text back to the boxes if they can hold
          // it, and keeps it as text if they cannot.
          if (typing) put(fromRaw(state.text));
          else put({ ...state, text: stored });
          setTyping(v => !v);
        }}
      >
        {t('edit.dateFreeText')}
      </Button>

      {typing && (
        <div className="mt-2">
          <label htmlFor={`${id}-text`} className="block text-xs text-muted-foreground">
            {t('edit.date')}
          </label>
          <Input
            id={`${id}-text`}
            value={state.text}
            onChange={e => put({ ...state, text: e.target.value })}
            className="mt-1 w-64"
          />
        </div>
      )}
    </fieldset>
  );
}
