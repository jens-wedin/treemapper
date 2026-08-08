import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PersonFull, CitationView, FamilyMember } from '../../lib/queries';
import { t, lifespan, displayName } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import { clearIssueMarks, useIssueMarks } from '../lib/issueMarks';
import ProblemList from '../components/issues/ProblemList';
import ChangeLog from '../components/issues/ChangeLog';
import PersonEditForm from '../components/edit/PersonEditForm';
import EventEditor from '../components/edit/EventEditor';
import RelationDialog from '../components/edit/RelationDialog';
import RichText from '../components/RichText';

function MemberLinks({ people }: { people: FamilyMember[] }) {
  if (!people.length) return <span className="text-muted-foreground">–</span>;
  return (
    <ul className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {people.map(p => (
        <li key={p.id}>
          <Link to={`/person/${p.id}`} className="text-primary underline-offset-2 hover:underline">
            {displayName(p)}
          </Link>{' '}
          <span className="text-sm text-muted-foreground">{lifespan(p.birthYear, p.deathYear)}</span>
        </li>
      ))}
    </ul>
  );
}

function Citations({ items }: { items: CitationView[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
      {items.map(c => (
        <li key={c.id}>
          {t('person.source')}:{' '}
          <Link to={`/kalla/${c.sourceId}`} className="underline-offset-2 hover:underline">
            {c.sourceTitle ?? c.sourceId}
          </Link>
          {c.quality != null && <> · {t('person.quality')} {c.quality}</>}
          {c.page && (
            /^https?:\/\//.test(c.page)
              ? <> · <a href={c.page} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">{new URL(c.page).hostname}</a></>
              : <> · {c.page}</>
          )}
          <RichText text={c.text} className="text-muted-foreground" />
        </li>
      ))}
    </ul>
  );
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PersonFull | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [editing, setEditing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Always on here, unlike the charts' opt-in badges: you came to look at one
  // person, and what the queue has on them belongs with the rest of the record.
  const marks = useIssueMarks(true);

  const load = useCallback(() => {
    fetchJson<PersonFull>(`/api/persons/${id}/full`)
      .then(d => {
        setData(d);
        setState('ok');
        document.title = `${displayName(d.person)} – ${t('appTitle')}`;
      })
      .catch(err => setState(err instanceof Error && err.message === 'HTTP 404' ? 'missing' : 'error'));
  }, [id]);

  // An edit can fix or create a problem, so the register has to be re-read.
  const reload = useCallback(() => {
    clearIssueMarks();
    load();
  }, [load]);

  useEffect(() => {
    setState('loading');
    setData(null);
    setEditing(false);
    setWarnings([]);
    load();
  }, [id, load]);

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
            <span className="ml-2 text-xl font-normal text-muted-foreground">({t('person.marriedName')} {person.marriedName})</span>
          )}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {lifespan(birth?.dateYear ?? null, death?.dateYear ?? null)}
          {birth?.place && <> · {birth.place}</>}
          {person.sex !== 'U' && (
            <Badge variant="outline" className="ml-2">
              {t(person.sex === 'M' ? 'edit.sexM' : 'edit.sexF')}
            </Badge>
          )}
        </p>
        <p className="mt-2 flex items-center gap-3">
          <Link to={`/trad/${person.id}`} className="text-primary underline-offset-2 hover:underline">
            {t('tree.showInTree')}
          </Link>
          <Button variant="outline" size="sm" aria-expanded={editing} onClick={() => setEditing(v => !v)}>
            {t('edit.edit')}
          </Button>
        </p>
        {warnings.length > 0 && (
          <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-400">{warnings.join(' ')}</p>
        )}
        {editing && (
          <PersonEditForm
            person={person}
            onSaved={w => { setWarnings(w); setEditing(false); reload(); }}
            onCancel={() => setEditing(false)}
          />
        )}
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
        <div className="mt-2 flex flex-wrap gap-2">
          {(['child', 'spouse', 'parent'] as const).map(type => (
            <RelationDialog key={type} type={type} person={person} families={data.families} onSaved={reload} />
          ))}
        </div>
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
                  <span className="text-sm text-muted-foreground"> · {t('person.marriage')} {f.marriage.dateRaw ?? f.marriage.dateYear}{f.marriage.place && `, ${f.marriage.place}`}</span>
                )}
              </div>
              <div><dt className="inline font-medium">{t('person.children')}: </dt><dd className="inline"><MemberLinks people={f.children} /></dd></div>
            </dl>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('person.timeline')}</h2>
        <EventEditor
          events={data.events}
          ownerId={person.id}
          citations={Citations}
          onChanged={reload}
        />
      </section>

      {person.note && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">{t('person.note')}</h2>
          <RichText text={person.note} className="mt-2 text-foreground" />
        </section>
      )}

      {data.personCitations.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">{t('person.citations')}</h2>
          <Citations items={data.personCitations} />
        </section>
      )}

      {marks[person.id] && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">{t('issues.section')}</h2>
          <ProblemList mark={marks[person.id]!} />
        </section>
      )}

      {/* sist: vad som gjorts med posten, inte vad posten säger */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('issues.changeLog')}</h2>
        <ChangeLog entries={data.log} />
      </section>
    </article>
  );
}
