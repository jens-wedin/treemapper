import { useEffect, useMemo, useState } from 'react';
import type { TreeData } from '../../lib/tree';
import { t, displayName, lifespan } from '../lib/i18n';
import { flattenAncestors, BRANCH_COLORS } from '../lib/ahnentafel';
import { layoutFan } from '../lib/fanLayout';
import { useChartViewport } from '../lib/useChartViewport';
import { useFlagPreference, useIssueMarkPreference } from '../lib/chartPreferences';
import { useIssueMarks } from '../lib/issueMarks';
import ChartToolbar from './ChartToolbar';
import CountryFlag from './CountryFlag';
import IssueBadge, { issueColor } from './IssueBadge';
import { issueLabel } from './PersonCard';

const shorten = (s: string, max = 22) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

export default function FanChart({ data, generations, onSelect, selectedId }: {
  data: TreeData;
  generations: number;
  onSelect: (personId: string) => void;
  selectedId: string | null;
}) {
  const layout = useMemo(
    () => layoutFan(flattenAncestors(data.ancestors, generations), generations),
    [data, generations],
  );
  const viewport = useChartViewport(layout.bounds);
  const [showFlags, setShowFlags] = useFlagPreference();
  const [showIssues, setShowIssues] = useIssueMarkPreference();
  const issueMarks = useIssueMarks(showIssues);
  const [activeKey, setActiveKey] = useState<string>(() => layout.slices[0]?.key ?? 'centre');

  useEffect(() => { setActiveKey(layout.slices[0]?.key ?? 'centre'); }, [layout]);

  function moveFocus(key: string | undefined) {
    if (!key) return;
    setActiveKey(key);
    viewport.svgRef.current?.querySelector<SVGGElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, key: string, personId: string) {
    const nav = layout.nav[key] ?? {};
    const actions: Record<string, () => void> = {
      ArrowUp: () => moveFocus(nav.up),
      ArrowDown: () => moveFocus(nav.down),
      ArrowLeft: () => moveFocus(nav.left),
      ArrowRight: () => moveFocus(nav.right),
      Enter: () => onSelect(personId),
      ' ': () => onSelect(personId),
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  const centre = layout.centre;
  const centreMark = issueMarks[centre.person.id];
  const centreWho = `${displayName(centre.person)}, ${lifespan(centre.person.birthYear, centre.person.deathYear) || '?'}`;
  const centreLabel = centreMark ? `${centreWho}. ${issueLabel(centreMark)}` : centreWho;

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <ChartToolbar
        zoomPercent={viewport.zoomPercent}
        onZoom={viewport.zoomBy}
        onReset={viewport.reset}
        showFlags={showFlags}
        onFlagsChange={setShowFlags}
        showIssues={showIssues}
        onIssuesChange={setShowIssues}
        hint={t('tree.instructionsAncestors')}
      />
      <div ref={viewport.wrapRef} className="mt-2 min-h-[320px] w-full flex-1 overflow-hidden rounded-lg border bg-[var(--chart-canvas)]">
        <svg
          ref={viewport.svgRef}
          role="group"
          aria-label={t('tree.fanLabel')}
          aria-describedby="trad-instruktioner"
          className="cursor-grab touch-none active:cursor-grabbing"
          {...viewport.svgProps}
        >
          <g transform={viewport.transform}>
            {layout.slices.map(s => {
              const colors = BRANCH_COLORS[s.branch];
              const isSelected = s.person.id === selectedId;
              const isActive = s.key === activeKey;
              const mark = issueMarks[s.person.id];
              const who = `${displayName(s.person)}, ${lifespan(s.person.birthYear, s.person.deathYear) || '?'}`;
              return (
                <g
                  key={s.key}
                  data-tree-node={s.person.id}
                  data-node-key={s.key}
                  data-issue-severity={mark?.severity}
                  tabIndex={isActive ? 0 : -1}
                  role="button"
                  aria-label={mark ? `${who}. ${issueLabel(mark)}` : who}
                  className="chart-card cursor-pointer outline-none"
                  onClick={() => onSelect(s.person.id)}
                  onFocus={() => setActiveKey(s.key)}
                  onKeyDown={e => onKeyDown(e, s.key, s.person.id)}
                >
                  {mark && <title>{mark.categories.join(', ')}</title>}
                  <path
                    d={s.wedgePath}
                    style={{
                      fill: isSelected ? 'var(--card-fill-selected)' : colors.fill,
                      stroke: isActive ? 'var(--card-stroke-active)' : 'var(--card-stroke)',
                    }}
                    strokeWidth={isActive ? 2.5 : 1}
                  />
                  {/* the coloured band marking each generation's outer edge */}
                  <path d={s.bandPath} fill="none" style={{ stroke: colors.band }} strokeWidth={3} />

                  {/* A wedge is too small for the counted badge the cards
                      wear — here the colour alone says which severity, and
                      the tooltip above says how many. */}
                  {mark && (
                    <circle
                      cx={s.mark.cx}
                      cy={s.mark.cy}
                      r={6}
                      style={{ fill: issueColor(mark.severity), stroke: 'var(--issue-ink)' }}
                      strokeWidth={1.5}
                    />
                  )}

                  {s.labelPath ? (
                    <>
                      <path id={`lbl-${s.key}`} d={s.labelPath} fill="none" />
                      <text className="fill-foreground" fontSize={s.fontSize} dy={s.showYears ? -2 : 4}>
                        <textPath href={`#lbl-${s.key}`} startOffset="50%" textAnchor="middle">
                          {shorten(displayName(s.person), s.labelMaxChars)}
                        </textPath>
                      </text>
                      {s.showYears && (
                        <text className="fill-muted-foreground" fontSize={s.fontSize - 2} dy={13}>
                          <textPath href={`#lbl-${s.key}`} startOffset="50%" textAnchor="middle">
                            {lifespan(s.person.birthYear, s.person.deathYear)}
                          </textPath>
                        </text>
                      )}
                    </>
                  ) : s.labelRadial && (
                    <text
                      x={s.labelRadial.x}
                      y={s.labelRadial.y}
                      transform={`rotate(${s.labelRadial.rotate} ${s.labelRadial.x} ${s.labelRadial.y})`}
                      textAnchor={s.labelRadial.anchor}
                      dominantBaseline="middle"
                      fontSize={s.fontSize}
                      className="fill-foreground"
                    >
                      {shorten(displayName(s.person), s.labelMaxChars)}
                      {s.showYears && (
                        <tspan className="fill-muted-foreground" fontSize={s.fontSize - 2}>
                          {'  '}{lifespan(s.person.birthYear, s.person.deathYear)}
                        </tspan>
                      )}
                    </text>
                  )}

                  {showFlags && s.showFlag && (
                    <CountryFlag code={s.person.country} cx={s.flag.cx} cy={s.flag.cy} r={7} />
                  )}
                </g>
              );
            })}

            {/* the focus person sits in the middle, not as a slice */}
            <g
              data-tree-node={centre.person.id}
              data-node-key="centre"
              tabIndex={-1}
              role="button"
              aria-label={centreLabel}
              className="chart-card cursor-pointer outline-none"
              onClick={() => onSelect(centre.person.id)}
            >
              <circle r={centre.r} style={{ fill: 'var(--card-fill)', stroke: 'var(--branch-focus-stroke)' }} strokeWidth={1.5} />
              {centre.person.photoId != null ? (
                <>
                  <clipPath id="fan-centre-photo">
                    <circle r={centre.r * 0.52} cy={-10} />
                  </clipPath>
                  <image
                    href={`/api/media/${centre.person.photoId}`}
                    x={-centre.r * 0.52}
                    y={-10 - centre.r * 0.52}
                    width={centre.r * 1.04}
                    height={centre.r * 1.04}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath="url(#fan-centre-photo)"
                  />
                </>
              ) : (
                <circle r={centre.r * 0.52} cy={-10} style={{ fill: 'var(--card-avatar)' }} />
              )}
              <text y={centre.r * 0.55} textAnchor="middle" className="fill-foreground text-[12px] font-medium">
                {shorten(displayName(centre.person))}
              </text>
              <text y={centre.r * 0.55 + 15} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {lifespan(centre.person.birthYear, centre.person.deathYear)}
              </text>
              {/* the middle is roomy enough for the badge the wedges cannot take */}
              {centreMark && <IssueBadge mark={centreMark} cx={centre.r * 0.6} cy={-centre.r * 0.6} r={11} />}
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
