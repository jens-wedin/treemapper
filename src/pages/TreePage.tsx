import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { TreeData } from '../../lib/tree';
import { t, displayName, lifespan } from '../lib/i18n';
import { ApiError, fetchJson } from '../lib/api';
import { useTreeUrl } from '../lib/treeUrl';
import { useIssueMarkPreference } from '../lib/chartPreferences';
import { clearIssueMarks, useIssueMarks } from '../lib/issueMarks';
import { flattenAncestors } from '../lib/ahnentafel';
import { layoutPedigree } from '../lib/pedigreeLayout';
import { layoutFan } from '../lib/fanLayout';
import { usePrefersReducedMotion } from '../lib/useReducedMotion';
import { useLingering } from '../lib/useLingering';
import AddRelativeDialog from '../components/edit/AddRelativeDialog';
import AncestorMorph from '../components/AncestorMorph';
import ChartSwitcher from '../components/ChartSwitcher';
import TreeSettings from '../components/TreeSettings';
import ViewTabs from '../components/ViewTabs';
import TreeChart from '../components/TreeChart';
import TreeList from '../components/TreeList';
import TreePersonPanel from '../components/TreePersonPanel';
import PedigreeChart from '../components/PedigreeChart';
import FanChart from '../components/FanChart';

// Tree owner — the natural default root for /trad without an id.
const DEFAULT_FOCUS = 'I500001';
// Five generations is as much as stays readable at once; beyond that the
// pedigree's expander buttons continue a single line instead.
const DEPTHS = [1, 2, 3, 4, 5];
const UP_DEPTHS = [1, 2, 3, 4, 5];
const VIEWS = ['family', 'pedigree', 'fan', 'list'] as const;
type View = (typeof VIEWS)[number];
/** What the tabs point at: one panel, whichever view is showing. */
const PANEL_ID = 'trad-vy';
/** Keep in step with .panel-leaving in index.css. */
const PANEL_OUT_MS = 320;

/** Reads a generation count from the URL, held to the options we offer. */
function clamp(raw: string | null, allowed: readonly number[]): number {
  const value = Number(raw ?? 3) || 3;
  return Math.min(allowed[allowed.length - 1]!, Math.max(allowed[0]!, value));
}

export default function TreePage() {
  const link = useTreeUrl();
  const { id: routeId } = useParams<{ id: string }>();
  const id = routeId ?? DEFAULT_FOCUS;
  const [params, setParams] = useSearchParams();
  // The API accepts deeper requests than the page offers; these clamps are
  // what the dropdowns promise.
  const upp = clamp(params.get('upp'), UP_DEPTHS);
  const ned = clamp(params.get('ned'), DEPTHS);
  const depthQuery = `?upp=${upp}&ned=${ned}`;

  const viewParam = params.get('vy') as View | null;
  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : 'family';

  const [data, setData] = useState<TreeData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error' | 'empty' | 'missing'>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  // The charts own the "Visa konsekvenser" checkbox; the panel reads the same
  // register, so a person's problems appear beside their details as well.
  const [showIssues] = useIssueMarkPreference();
  const issueMarks = useIssueMarks(showIssues);

  // The list view has no chart to sit beside, so it has no panel either.
  const panel = useLingering(view === 'list' ? null : selectedId, PANEL_OUT_MS);

  /**
   * The antavla and the solfjäder draw the same people under the same
   * Ahnentafel numbers, so switching between those two can be a morph rather
   * than a fade. Every other pair has cards with nowhere to travel to.
   */
  const reduced = usePrefersReducedMotion();
  const [morph, setMorph] = useState<'toFan' | 'toPedigree' | null>(null);
  /** Whose card's plus was pressed; the dialog lives outside the SVG. */
  const [relativeFor, setRelativeFor] = useState<string | null>(null);
  /** Bumped after an edit, to fetch the chart again. */
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * Decided as the view is chosen, not afterwards in an effect. An effect runs
   * a render too late: the charts would already have started their 240 ms
   * cross-fade and the solfjäder would be fully drawn while the markers were
   * still travelling. Batched with the URL change, both land together.
   */
  function chooseView(next: View) {
    if (!reduced && view !== next) {
      if (view === 'pedigree' && next === 'fan') setMorph('toFan');
      else if (view === 'fan' && next === 'pedigree') setMorph('toPedigree');
    }
    setParam('vy', next);
  }

  // Built only while a morph runs. layoutPedigree is called without the
  // branches opened by hand: those live in PedigreeChart's own state and are
  // already lost when it remounts, so the base slots are exactly what is on
  // screen at both ends.
  const morphLayouts = useMemo(() => {
    if (!morph || !data) return null;
    const slots = flattenAncestors(data.ancestors, upp);
    return { pedigree: layoutPedigree(slots), fan: layoutFan(slots, upp) };
  }, [morph, data, upp]);

  /** Re-roots the chart on someone, keeping the current view and depths. */
  function focusOn(personId: string) {
    setSelectedId(null);
    navigate(link(`/trad/${personId}${depthQuery}&vy=${view}`));
  }

  // The previous chart stays on screen while the next one loads: blanking it
  // made every change of person or depth flash. `stale` guards against an
  // earlier request landing after a later one.
  useEffect(() => {
    let stale = false;
    setState('loading');
    fetchJson<TreeData>(`/api/tree/${id}?up=${upp}&down=${ned}`)
      .then(d => {
        if (stale) return;
        setData(d);
        setState('ok');
        document.title = `${t('tree.title')}: ${displayName(d.focus)} – ${t('appTitle')}`;
      })
      .catch(async err => {
        if (stale) return;
        // "That person is not here" is not a broken API. It is the ordinary
        // state of a tree that was just created, and of any imported tree
        // whose xrefs simply do not include the id we defaulted to — so ask
        // the tree who it does have, and go there instead.
        if (!(err instanceof ApiError) || err.status !== 404) { setState('error'); return; }
        try {
          const found = await fetchJson<{ items: { id: string }[] }>('/api/persons?limit=1');
          const first = found.items[0]?.id;
          if (stale) return;
          if (!first) setState('empty');
          else if (!routeId) navigate(link(`/trad/${first}${depthQuery}&vy=${view}`), { replace: true });
          else setState('missing');
        } catch {
          if (!stale) setState('error');
        }
      });
    return () => { stale = true; };
  }, [id, upp, ned, routeId, depthQuery, view, navigate, reloadKey]);

  // Functional form: changing view and depth in quick succession must not have
  // the second change read a snapshot taken before the first.
  function setParam(key: string, value: string) {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    });
  }
  const setDepth = (key: 'upp' | 'ned', value: string) => setParam(key, value);

  if (state === 'error') return <p role="alert">{t('common.error')}</p>;
  if (state === 'empty' || state === 'missing') {
    return (
      <section>
        <h1 className="text-2xl font-bold">{t('tree.title')}</h1>
        <p className="mt-3 text-muted-foreground">
          {t(state === 'empty' ? 'tree.emptyTree' : 'tree.personGone')}
        </p>
        <Link to={link('/personer')} className="mt-3 inline-block text-primary underline-offset-2 hover:underline">
          {t('tree.toPersons')}
        </Link>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-busy={state === 'loading' || undefined}>
      <h1 className="text-2xl font-bold">{t('tree.title')}</h1>
      {data && (
        // The name itself is the link. A separate "open person page" beside it
        // said the same thing twice and put the useful target second.
        <p className="mt-1 text-muted-foreground">
          <Link to={link(`/person/${data.focus.id}`)} className="text-primary underline-offset-2 hover:underline">
            {displayName(data.focus)}
          </Link>
          {' '}
          {lifespan(data.focus.birthYear, data.focus.deathYear)}
        </p>
      )}

      <div className="mt-4 flex items-end justify-between gap-3">
        <ViewTabs views={VIEWS} value={view} panelId={PANEL_ID} onChange={chooseView} />
        <TreeSettings
          up={upp}
          down={ned}
          upOptions={UP_DEPTHS}
          downOptions={DEPTHS}
          showDown={view === 'family' || view === 'list'}
          onUp={value => setDepth('upp', value)}
          onDown={value => setDepth('ned', value)}
        />
      </div>

      {/* only the very first load has nothing to show; a reload keeps the chart */}
      {state === 'loading' && !data && <p className="mt-4 text-muted-foreground">{t('common.loading')}</p>}
      {data && (
        <div
          id={PANEL_ID}
          role="tabpanel"
          aria-labelledby={`tab-${view}`}
          // The gap below the tabs lives here, on the row, so the chart and the
          // person panel share one top edge.
          className="mt-4 flex min-h-0 flex-1 gap-3"
        >
          {/* One switcher across all four views, so every combination fades —
              including to and from the list, which is HTML rather than SVG. */}
          <ChartSwitcher
            viewKey={view}
            morphing={morph !== null}
            overlay={morphLayouts && morph
              ? size => (
                <AncestorMorph
                  pedigree={morphLayouts.pedigree}
                  fan={morphLayouts.fan}
                  direction={morph}
                  size={size}
                  onDone={() => setMorph(null)}
                />
              )
              : undefined}
          >
            {view === 'list' ? (
              <TreeList ancestors={data.ancestors} descendants={data.descendants} depthQuery={depthQuery} />
            ) : view === 'family' ? (
              <TreeChart data={data} onSelect={setSelectedId} selectedId={selectedId} onAddRelative={setRelativeFor} />
            ) : view === 'pedigree' ? (
              <PedigreeChart data={data} generations={upp} onSelect={setSelectedId} selectedId={selectedId} onAddRelative={setRelativeFor} />
            ) : (
              <FanChart data={data} generations={upp} onSelect={setSelectedId} selectedId={selectedId} />
            )}
          </ChartSwitcher>
          {/* Outside the charts: an SVG cannot host a dialog, and the new
              relative must survive the chart being redrawn around it. */}
          <AddRelativeDialog
            personId={relativeFor}
            onClose={() => setRelativeFor(null)}
            onSaved={() => { clearIssueMarks(); setReloadKey(k => k + 1); }}
          />

          {/* Held for the length of its exit, so closing slides away instead
              of blinking out — the panel still needs the person it was
              showing while it leaves. */}
          {panel.value && (
            <TreePersonPanel
              key={panel.value}
              personId={panel.value}
              issue={issueMarks[panel.value]}
              onClose={() => setSelectedId(null)}
              onSelect={setSelectedId}
              onFocusTree={focusOn}
              className={panel.leaving ? 'panel-leaving' : 'panel-entering'}
            />
          )}
        </div>
      )}
    </section>
  );
}
