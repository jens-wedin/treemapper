import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { uiLocale } from '../../lib/i18n';

/** A ranked "top ten" list. `icon` lets the countries list show its flags. */
export default function RankedList({ title, rows, caption, icon, label, href }: {
  title: string;
  rows: { name: string; count: number }[];
  caption?: string;
  icon?: (name: string) => ReactNode;
  /** For rows keyed by a code rather than by their own name — countries. */
  label?: (name: string) => string;
  /**
   * When set, each name is a link to this address — the names lists search the
   * People page, so a common name is one click from the people who carry it.
   */
  href?: (name: string) => string;
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-muted-foreground">—</p>
      ) : (
        <ol className="mt-2 space-y-1">
          {rows.map((r, i) => {
            const text = label ? label(r.name) : r.name;
            return (
              <li key={r.name} className="flex justify-between gap-4">
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  {icon?.(r.name)}
                  {href ? (
                    <Link to={href(r.name)} className="text-primary underline-offset-2 hover:underline">
                      {text}
                    </Link>
                  ) : (
                    text
                  )}
                </span>
                <span className="text-muted-foreground">{r.count.toLocaleString(uiLocale())}</span>
              </li>
            );
          })}
        </ol>
      )}
      {caption && <p className="mt-2 text-sm text-muted-foreground">{caption}</p>}
    </div>
  );
}
