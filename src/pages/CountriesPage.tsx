import { useCallback, useEffect, useState } from 'react';
import { t, tf } from '../lib/i18n';
import { fetchJson, mutateJson } from '../lib/api';
import EvidenceGroup from '../components/countries/EvidenceGroup';
import PlaceRow, { nearMissDetail } from '../components/countries/PlaceRow';
import type { CountryProposals } from '../../lib/countryProposals';

/**
 * Filling in the country of a place, one approval at a time.
 *
 * Three sections, in this order on purpose. What the record already says comes
 * first because approving it rewrites text somebody wrote. What the tree taught
 * itself comes next, grouped by evidence so 1 253 places are 402 decisions.
 * The near-spelling matches come last, one row each, with no approve-all —
 * reading all 125 of them against the real database found seven wrong
 * countries, and a batch button is exactly how those seven would get in.
 */
export default function CountriesPage() {
  const [data, setData] = useState<CountryProposals | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    fetchJson<CountryProposals>('/api/countries')
      .then(d => { setData(d); setState('ok'); })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    document.title = `${t('countries.title')} – ${t('appTitle')}`;
    load();
  }, [load]);

  async function decide(action: 'apply' | 'reject', places: string[], code: string) {
    setBusy(true);
    try {
      const { data: result } = await mutateJson<{ changed?: number; rejected?: number }>(
        `/api/countries/${action}`, 'POST', { places, code },
      );
      setMessage(action === 'apply'
        ? tf('countries.applied', { n: result.changed ?? 0 })
        : tf('countries.rejectedCount', { n: result.rejected ?? 0 }));
      load();
    } catch {
      setMessage(t('countries.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <p className="p-6 text-muted-foreground">{t('countries.loading')}</p>;
  if (state === 'error' || !data) return <p className="p-6 text-destructive">{t('countries.failed')}</p>;

  const { stated, learned, quarantined, unanswered } = data;
  const nothingLeft = !stated.length && !learned.length && !quarantined.length;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">{t('countries.title')}</h1>
      <p className="mt-1 text-muted-foreground">{t('countries.lead')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('countries.fixByHand')}</p>

      {/* Announced, because approving a group of 79 changes something the
          reader cannot see from where the button was. */}
      <p aria-live="polite" className="mt-2 min-h-5 text-sm font-medium">{message}</p>

      {nothingLeft && <p className="mt-6">{t('countries.empty')}</p>}

      {stated.length > 0 && (
        <section className="mt-8" aria-labelledby="countries-stated">
          <h2 id="countries-stated" className="text-lg font-medium">{t('countries.statedTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('countries.statedLead')}</p>
          <ul className="mt-3 space-y-2">
            {stated.map(s => (
              <PlaceRow
                key={`${s.place}-${s.code}`}
                place={s.place}
                code={s.code}
                after={s.after}
                owners={s.owners}
                moreOwners={s.moreOwners}
                busy={busy}
                onApprove={() => decide('apply', [s.place], s.code)}
                onReject={() => decide('reject', [s.place], s.code)}
              />
            ))}
          </ul>
        </section>
      )}

      {learned.length > 0 && (
        <section className="mt-8" aria-labelledby="countries-learned">
          <h2 id="countries-learned" className="text-lg font-medium">{t('countries.learnedTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('countries.learnedLead')}</p>
          <ul className="mt-3 space-y-2">
            {learned.map(group => (
              <EvidenceGroup
                key={`${group.by}-${group.code}`}
                group={group}
                busy={busy}
                onApprove={() => decide('apply', group.items.map(i => i.place), group.code)}
                onReject={() => decide('reject', group.items.map(i => i.place), group.code)}
              />
            ))}
          </ul>
        </section>
      )}

      {quarantined.length > 0 && (
        <section className="mt-8" aria-labelledby="countries-quarantine">
          <h2 id="countries-quarantine" className="text-lg font-medium">{t('countries.quarantineTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('countries.quarantineLead')}</p>
          {/* No approve-all here, deliberately. See the note at the top. */}
          <ul className="mt-3 space-y-2">
            {quarantined.map(q => (
              <PlaceRow
                key={`${q.place}-${q.code}`}
                place={q.place}
                code={q.code}
                detail={nearMissDetail(q.matched, q.by, q.weight)}
                owners={q.owners}
                moreOwners={q.moreOwners}
                busy={busy}
                onApprove={() => decide('apply', [q.place], q.code)}
                onReject={() => decide('reject', [q.place], q.code)}
              />
            ))}
          </ul>
        </section>
      )}

      {unanswered > 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          {tf('countries.unanswered', { n: unanswered })}
        </p>
      )}
    </div>
  );
}
