import { Button } from '@/components/ui/button';
import CountryFlag from '../CountryFlag';
import { t, tf, countryLabel } from '../../lib/i18n';
import { nearMiss, strength } from '../../lib/countryText';

/**
 * A single place, decided on its own.
 *
 * Used for both the quarantine and the places whose country the record already
 * contains — in each case the text is the evidence, so it is shown in full and
 * there is no approve-all to sweep it past the reader.
 */
export default function PlaceRow({ place, code, after, detail, busy, onApprove, onReject }: {
  place: string;
  code: string;
  /** What the text would become, when approving rewrites rather than appends. */
  after?: string;
  /** The near-miss, or how strongly the tree taught it. */
  detail?: string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const country = countryLabel(code);

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <svg viewBox="-9 -9 18 18" className="inline-block h-4 w-4 shrink-0 align-[-2px]" aria-hidden>
              <CountryFlag code={code} cx={0} cy={0} r={8} />
            </svg>
            <span className="font-medium">{country}</span>
          </p>
          <p className="mt-1 break-words font-mono text-sm">{place}</p>
          {after && (
            <p className="mt-1 break-words font-mono text-sm text-muted-foreground">
              <span className="font-sans">{t('countries.becomes')}</span> {after}
            </p>
          )}
          {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            disabled={busy}
            aria-label={tf('countries.approveNamed', { country, by: place })}
            onClick={onApprove}
          >
            {t('countries.approve')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            aria-label={tf('countries.rejectNamed', { country, by: place })}
            onClick={onReject}
          >
            {t('countries.reject')}
          </Button>
        </div>
      </div>
    </li>
  );
}

/** The quarantine's line: which word matched what, and how well taught it was. */
export function nearMissDetail(matched: string | undefined, by: string, weight: number): string {
  return `${nearMiss(matched, by)} · ${strength(weight)}`;
}
