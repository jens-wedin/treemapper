import { Input } from '@/components/ui/input';
import { COUNTRY_NAMES } from '../../../lib/places';
import { t, countryLabel, getLanguage } from '../../lib/i18n';
import { countryOf, withCountry, OTHER } from '../../lib/placeField';

/**
 * A place, with a select for the one part of it that is a closed set.
 *
 * GEDCOM's PLAC is free text and its only rule is position — smallest
 * jurisdiction first, largest last — so the country is simply the last segment.
 * That is what the select reads and rewrites; the parish and county in front of
 * it stay text, because the hierarchy here runs from one level to five and no
 * fixed set of boxes fits it.
 *
 * The list cannot be complete and does not pretend to be: ISO 3166 has no
 * Preussen, no Österrike-Ungern and no pre-1917 Ryssland, and this tree reaches
 * into the 1600s. A place ending in something unrecognised shows *somewhere
 * else* and is left alone.
 *
 * The options are named in the reader's language while the place text keeps the
 * Swedish name — an English reader picks "Sweden" and the box reads "Sverige".
 * That is the project's rule showing through rather than a bug: the interface
 * is translated, and what was written in the register is not.
 */
const CODES = [...new Set(Object.values(COUNTRY_NAMES))].sort((a, b) =>
  countryLabel(a).localeCompare(countryLabel(b), getLanguage()));

export default function PlaceInput({ id, value, onChange }: {
  id: string;
  value: string;
  onChange: (place: string) => void;
}) {
  const selected = countryOf(value);

  return (
    <>
      <div>
        <label htmlFor={id} className="block text-sm font-medium">{t('edit.place')}</label>
        <Input id={id} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-64" />
      </div>
      <div>
        <label htmlFor={`${id}-country`} className="block text-sm font-medium">{t('edit.country')}</label>
        <select
          id={`${id}-country`}
          value={selected}
          onChange={e => onChange(withCountry(value, e.target.value))}
          disabled={!value.trim()}
          className="mt-1 h-9 w-44 rounded-md border bg-background px-2 text-sm disabled:bg-muted disabled:opacity-50"
        >
          <option value="">— {t('edit.countryNone')}</option>
          {CODES.map(code => <option key={code} value={code}>{countryLabel(code)}</option>)}
          {/* Only offered when it is already the case; picking it is meaningless. */}
          {selected === OTHER && <option value={OTHER}>{t('edit.countryOther')}</option>}
        </select>
      </div>
    </>
  );
}
