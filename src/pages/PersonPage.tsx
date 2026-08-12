import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PersonFull, CitationView, FamilyMember } from '../../lib/queries';
import { t, lifespan, displayName } from '../lib/i18n';
import { ApiError, apiUrl, fetchJson } from '../lib/api';
import { useTreeUrl } from '../lib/treeUrl';
import AddCitationToPerson from '../components/edit/AddCitationToPerson';
import RemoveCitationButton from '../components/edit/RemoveCitationButton';
import { clearIssueMarks, useIssueMarks } from '../lib/issueMarks';
import ProblemList from '../components/issues/ProblemList';
import ChangeLog from '../components/issues/ChangeLog';
import PersonEditForm from '../components/edit/PersonEditForm';
import PhotoLightbox from '../components/PhotoLightbox';
import PhotoUpload from '../components/edit/PhotoUpload';
import EventEditor from '../components/edit/EventEditor';
import MarriageEditor from '../components/edit/MarriageEditor';
import RelationDialog from '../components/edit/RelationDialog';
import RichText from '../components/RichText';

function MemberLinks({ people }: { people: FamilyMember[] }) {
  const link = useTreeUrl();
  if (!people.length) return <span className="text-muted-foreground">–</span>;
  return (
    <ul className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {people.map(p => (
        <li key={p.id}>
          <Link to={link(`/person/${p.id}`)} className="text-primary underline-offset-2 hover:underline">
            {displayName(p)}
          </Link>{' '}
          <span className="text-sm text-muted-foreground">{lifespan(p.birthYear, p.deathYear)}</span>
        </li>
      ))}
    </ul>
  );
}

function Citations({ items, onChanged }: { items: CitationView[]; onChanged?: () => void }) {
  const link = useTreeUrl();
  if (!items.length) return null;
  return (
    <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
      {items.map(c => (
        <li key={c.id}>
          {t('person.source')}:{' '}
          <Link to={link(`/source/${c.sourceId}`)} className="underline-offset-2 hover:underline">
            {c.sourceTitle ?? c.sourceId}
          </Link>
          {c.quality != null && <> · {t('person.quality')} {c.quality}</>}
          {onChanged && <> · <RemoveCitationButton id={c.id} onRemoved={onChanged} /></>}
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
  const link = useTreeUrl();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PersonFull | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [editing, setEditing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  /** Which photo is open in the lightbox, by index; null when closed. */
  const [photoAt, setPhotoAt] = useState<number | null>(null);

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
      .catch(err => setState(err instanceof ApiError && err.status === 404 ? 'missing' : 'error'));
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
    return <p>{t('common.notFound')} <Link className="underline" to={link('/people')}>{t('common.backToList')}</Link></p>;
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
          <Link to={link(`/tree/${person.id}`)} className="text-primary underline-offset-2 hover:underline">
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

      {/* Shown even with no photos: adding the first one has to be possible. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{t('person.photos')}</h2>
          <PhotoUpload personId={person.id} onAdded={reload} />
        </div>
        {photos.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-3">
            {photos.map((m, i) => (
              <li key={m.id}>
                {/* A button, not a clickable image: the keyboard and a screen
                    reader both need to know this opens something. */}
                <button
                  type="button"
                  onClick={() => setPhotoAt(i)}
                  aria-label={t('person.photoOpen').replace('{name}', m.title ?? displayName(person))}
                  className="chart-card rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <img
                    src={apiUrl(`/api/media/${m.id}`)}
                    alt={m.title ?? displayName(person)}
                    loading="lazy"
                    className="h-40 w-40 cursor-zoom-in rounded-lg border object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        <PhotoLightbox
          photos={photos}
          openAt={photoAt}
          fallbackAlt={displayName(person)}
          onClose={() => setPhotoAt(null)}
          onRemoved={reload}
        />
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{t('person.family')}</h2>
          <div className="flex flex-wrap gap-2">
            {(['child', 'spouse', 'parent'] as const).map(type => (
              <RelationDialog key={type} type={type} person={person} families={data.families} onSaved={reload} />
            ))}
          </div>
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
              </div>
              <div><dt className="inline font-medium">{t('person.children')}: </dt><dd className="inline"><MemberLinks people={f.children} /></dd></div>
            </dl>
            {/* The wedding belongs to the couple, not to either spouse — see
                MarriageEditor for why it is not among the person's events. */}
            <MarriageEditor familyId={f.familyId} marriage={f.marriage} onChanged={load} />
          </div>
        ))}
      </section>

      <section className="mt-8">
        {/* The heading is EventEditor's, so "Add event" can share its line
            without the adding state having to live up here. */}
        <EventEditor
          events={data.events}
          ownerId={person.id}
          title={t('person.timeline')}
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

      {/* Shown even when empty: without somewhere to put the first one, a
          person can never acquire a source. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{t('person.citations')}</h2>
          <AddCitationToPerson personId={person.id} onAdded={load} />
        </div>
        {data.personCitations.length > 0
          ? <Citations items={data.personCitations} onChanged={load} />
          : <p className="mt-2 text-muted-foreground">{t('sources.none')}</p>}
      </section>

      {marks[person.id] && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">{t('issues.section')}</h2>
          <ProblemList mark={marks[person.id]!} />
        </section>
      )}

      {/* Last: what has been done to the record, not what the record says. */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('issues.changeLog')}</h2>
        <ChangeLog entries={data.log} />
      </section>
    </article>
  );
}
