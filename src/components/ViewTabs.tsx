import { useRef } from 'react';
import { t } from '../lib/i18n';

/**
 * The four ways of looking at the tree, as tabs.
 *
 * Hand-rolled rather than a Tabs primitive because the panel is not a sibling
 * this component can own: it is the animated chart switcher, which has to stay
 * mounted across a change of tab for the cross-fade and the morph to happen at
 * all. What matters is the ARIA contract, and that is small — a tablist, tabs
 * that say which one is selected, and arrow keys with a single tab stop.
 */
export default function ViewTabs<T extends string>({ views, value, panelId, onChange }: {
  views: readonly T[];
  value: T;
  panelId: string;
  onChange: (next: T) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const index = e.key === 'Home' ? 0 : e.key === 'End' ? views.length - 1 : null;
    if (!step && index === null) return;
    e.preventDefault();

    const from = views.indexOf(value);
    const to = index ?? (from + step + views.length) % views.length;
    onChange(views[to]!);
    // Selection follows focus, so the newly selected tab has to take it.
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t('tree.viewLabel')}
      onKeyDown={onKeyDown}
      className="flex gap-1 border-b"
    >
      {views.map(view => {
        const selected = view === value;
        return (
          <button
            key={view}
            type="button"
            role="tab"
            id={`tab-${view}`}
            aria-selected={selected}
            aria-controls={panelId}
            // One tab stop for the whole set: arrow keys move within it.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(view)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              selected
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
            }`}
          >
            {t(`tree.view${view[0]!.toUpperCase()}${view.slice(1)}`)}
          </button>
        );
      })}
    </div>
  );
}
