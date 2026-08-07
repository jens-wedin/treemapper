import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PersonFull, FamilyMember } from '../../lib/queries';
import { t, eventLabel, eventDescription, lifespan, displayName } from '../lib/i18n';
import { fetchJson } from '../lib/api';

function MemberLinks({ people, onSelect }: { people: FamilyMember[]; onSelect: (id: string) => void }) {
  if (!people.length) return <span className="text-gray-500">–</span>;
  return (
    <ul className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {people.map(p => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onSelect(p.id)}
            className="text-blue-700 underline-offset-2 hover:underline"
          >
            {displayName(p)}
          </button>{' '}
          <span className="text-sm text-gray-500">{lifespan(p.birthYear, p.deathYear)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Details for the card the user clicked. Non-modal on purpose: the chart stays
 * usable beside it, so this is a labelled region rather than a dialog that
 * traps focus.
 */
export default function TreePersonPanel({ personId, onClose, onFocusTree, onSelect }: {
  personId: string;
  onClose: () => void;
  onFocusTree: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [data, setData] = useState<PersonFull | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setState('loading');
    setData(null);
    fetchJson<PersonFull>(`/api/persons/${personId}/full`)
      .then(d => { setData(d); setState('ok'); })
      .catch(() => setState('error'));
  }, [personId]);

  // Move focus to the panel when it opens so keyboard users land in it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [personId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const person = data?.person;
  const birth = data?.events.find(e => e.type === 'BIRT');
  const death = data?.events.find(e => e.type === 'DEAT');
  const photos = data?.media.filter(m => m.available) ?? [];

  return (
    <aside
      aria-label={t('tree.panelTitle')}
      className="flex w-[340px] shrink-0 flex-col overflow-y-auto rounded-lg border bg-white p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
          {person ? displayName(person) : t('tree.panelTitle')}
        </h2>
        <Button variant="outline" size="sm" onClick={onClose} aria-label={t('tree.closePanel')}>
          ✕
        </Button>
      </div>

      {state === 'loading' && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {state === 'error' && <p role="alert" className="mt-4 text-red-700">{t('common.error')}</p>}

      {data && person && (
        <>
          <div className="mt-3 flex items-center gap-3">
            {photos[0] && (
              <img
                src={`/api/media/${photos[0].id}`}
                alt={photos[0].title ?? displayName(person)}
                className="h-20 w-20 rounded-full border object-cover"
              />
            )}
            <div>
              <p className="text-gray-700">{lifespan(birth?.dateYear ?? null, death?.dateYear ?? null)}</p>
              {person.marriedName && (
                <p className="text-sm text-gray-500">{t('person.marriedName')} {person.marriedName}</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onFocusTree(person.id)}>{t('tree.focusHere')}</Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/person/${person.id}`}>{t('tree.goToPerson')}</Link>
            </Button>
          </div>

          <dl className="mt-4 space-y-1 text-sm">
            {birth && (
              <div>
                <dt className="inline font-medium">{t('person.born')}: </dt>
                <dd className="inline">{[birth.dateRaw, birth.place].filter(Boolean).join(', ') || '–'}</dd>
              </div>
            )}
            {death && (
              <div>
                <dt className="inline font-medium">{t('person.died')}: </dt>
                <dd className="inline">{[death.dateRaw, death.place].filter(Boolean).join(', ') || '–'}</dd>
              </div>
            )}
          </dl>

          <section className="mt-5">
            <h3 className="font-medium">{t('person.family')}</h3>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="inline font-medium">{t('person.parents')}: </dt>
                <dd className="inline"><MemberLinks people={data.parents} onSelect={onSelect} /></dd>
              </div>
              <div>
                <dt className="inline font-medium">{t('person.siblings')}: </dt>
                <dd className="inline"><MemberLinks people={data.siblings} onSelect={onSelect} /></dd>
              </div>
              {data.families.map(f => (
                <div key={f.familyId}>
                  <dt className="inline font-medium">{t('person.spouse')}: </dt>
                  <dd className="inline">
                    <MemberLinks people={f.spouse ? [f.spouse] : []} onSelect={onSelect} />
                  </dd>
                  {f.children.length > 0 && (
                    <div className="ml-3 mt-1">
                      <span className="font-medium">{t('person.children')}: </span>
                      <MemberLinks people={f.children} onSelect={onSelect} />
                    </div>
                  )}
                </div>
              ))}
            </dl>
          </section>

          {data.events.length > 0 && (
            <section className="mt-5">
              <h3 className="font-medium">{t('person.timeline')}</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {data.events.map(e => (
                  <li key={e.id}>
                    <span className="font-medium">{eventLabel(e.type)}</span>
                    {e.dateRaw && <span className="ml-2 text-gray-600">{e.dateRaw}</span>}
                    {(e.place || eventDescription(e.description)) && (
                      <div className="text-gray-600">
                        {[eventDescription(e.description), e.place].filter(Boolean).join(' — ')}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {person.note && (
            <section className="mt-5">
              <h3 className="font-medium">{t('person.note')}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{person.note}</p>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
