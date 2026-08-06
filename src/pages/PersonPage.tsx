import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { PersonFull, CitationView, FamilyMember } from '../../lib/queries';
import { t, eventLabel, lifespan, displayName } from '../lib/i18n';
import { fetchJson } from '../lib/api';

function MemberLinks({ people }: { people: FamilyMember[] }) {
  if (!people.length) return <span className="text-gray-500">–</span>;
  return (
    <ul className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {people.map(p => (
        <li key={p.id}>
          <Link to={`/person/${p.id}`} className="text-blue-700 underline-offset-2 hover:underline">
            {displayName(p)}
          </Link>{' '}
          <span className="text-sm text-gray-500">{lifespan(p.birthYear, p.deathYear)}</span>
        </li>
      ))}
    </ul>
  );
}

function Citations({ items }: { items: CitationView[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 space-y-1 text-sm text-gray-600">
      {items.map(c => (
        <li key={c.id}>
          {t('person.source')}: {c.sourceTitle ?? c.sourceId}
          {c.quality != null && <> · {t('person.quality')} {c.quality}</>}
          {c.page && (
            /^https?:\/\//.test(c.page)
              ? <> · <a href={c.page} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">{new URL(c.page).hostname}</a></>
              : <> · {c.page}</>
          )}
          {c.text && <div className="whitespace-pre-line text-gray-500">{c.text}</div>}
        </li>
      ))}
    </ul>
  );
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PersonFull | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');

  useEffect(() => {
    setState('loading');
    setData(null);
    fetchJson<PersonFull>(`/api/persons/${id}/full`)
      .then(d => {
        setData(d);
        setState('ok');
        document.title = `${displayName(d.person)} – ${t('appTitle')}`;
      })
      .catch(err => setState(err instanceof Error && err.message === 'HTTP 404' ? 'missing' : 'error'));
  }, [id]);

  if (state === 'loading') {
    return <div className="space-y-3"><Skeleton className="h-9 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (state === 'missing') {
    return <p>{t('common.notFound')} <Link className="underline" to="/personer">{t('common.backToList')}</Link></p>;
  }
  if (state === 'error' || !data) return <p role="alert">{t('common.error')}</p>;

  const { person } = data;
  const birth = data.events.find(e => e.type === 'BIRT');
  const death = data.events.find(e => e.type === 'DEAT');
  const photos = data.media.filter(m => m.available);

  return (
    <article>
      <header>
        <h1 className="text-3xl font-bold">
          {displayName(person)}
          {person.marriedName && (
            <span className="ml-2 text-xl font-normal text-gray-600">({t('person.marriedName')} {person.marriedName})</span>
          )}
        </h1>
        <p className="mt-1 text-gray-600">
          {lifespan(birth?.dateYear ?? null, death?.dateYear ?? null)}
          {birth?.place && <> · {birth.place}</>}
          {person.sex !== 'U' && <Badge variant="outline" className="ml-2">{person.sex === 'M' ? 'Man' : 'Kvinna'}</Badge>}
        </p>
        <p className="mt-2">
          <Link to={`/trad/${person.id}`} className="text-blue-700 underline-offset-2 hover:underline">
            {t('tree.showInTree')}
          </Link>
        </p>
      </header>

      {photos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">{t('person.photos')}</h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {photos.map(m => (
              <li key={m.id}>
                <img
                  src={`/api/media/${m.id}`}
                  alt={m.title ?? displayName(person)}
                  loading="lazy"
                  className="h-40 w-40 rounded-lg border object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('person.family')}</h2>
        <dl className="mt-3 space-y-2">
          <div><dt className="inline font-medium">{t('person.parents')}: </dt><dd className="inline"><MemberLinks people={data.parents} /></dd></div>
          <div><dt className="inline font-medium">{t('person.siblings')}: </dt><dd className="inline"><MemberLinks people={data.siblings} /></dd></div>
        </dl>
        {data.families.map(f => (
          <div key={f.familyId} className="mt-4 rounded-lg border p-4">
            <dl className="space-y-2">
              <div>
                <dt className="inline font-medium">{t('person.spouse')}: </dt>
                <dd className="inline"><MemberLinks people={f.spouse ? [f.spouse] : []} /></dd>
                {f.marriage && (
                  <span className="text-sm text-gray-600"> · {t('person.marriage')} {f.marriage.dateRaw ?? f.marriage.dateYear}{f.marriage.place && `, ${f.marriage.place}`}</span>
                )}
              </div>
              <div><dt className="inline font-medium">{t('person.children')}: </dt><dd className="inline"><MemberLinks people={f.children} /></dd></div>
            </dl>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('person.timeline')}</h2>
        <ol className="mt-3 space-y-4 border-l pl-4">
          {data.events.map(e => (
            <li key={e.id}>
              <div className="font-medium">
                {eventLabel(e.type)}
                {e.dateRaw && <span className="ml-2 font-normal text-gray-600">{e.dateRaw}</span>}
                {e.age && <span className="ml-2 text-sm font-normal text-gray-500">({t('person.age')} {e.age})</span>}
              </div>
              {(e.place || e.description) && (
                <div className="text-gray-700">{[e.description, e.place].filter(Boolean).join(' — ')}</div>
              )}
              <Citations items={e.citations} />
            </li>
          ))}
        </ol>
      </section>

      {person.note && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">{t('person.note')}</h2>
          <p className="mt-2 whitespace-pre-line text-gray-700">{person.note}</p>
        </section>
      )}

      {data.personCitations.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">{t('person.citations')}</h2>
          <Citations items={data.personCitations} />
        </section>
      )}
    </article>
  );
}
