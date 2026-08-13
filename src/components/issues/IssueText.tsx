import { Link } from 'react-router';
import type { IssueCode, IssueParams } from '../../../lib/issues';
import { t } from '../../lib/i18n';
import { useTreeUrl } from '../../lib/treeUrl';
import { resolveParams, PERSON_PARAMS } from '../../lib/issueText';

/**
 * The problem in words — the same sentence `issueText()` builds — with the
 * people it names linked to their pages, so a problem is one click from the
 * record it is about rather than a name to copy into search.
 *
 * The template is filled here rather than by `tf()` so a person placeholder can
 * become a `<Link>`: `PERSON_PARAMS` says which placeholders name a person and
 * in which `personIds` order, and everything else keeps `format()`'s behaviour
 * — a resolved value, or the raw `{key}` when there is none.
 */
export default function IssueText({ code, params, personIds }: {
  code: IssueCode;
  params: IssueParams;
  personIds: string[];
}) {
  const link = useTreeUrl();
  const resolved = resolveParams(params);
  const personKeys = PERSON_PARAMS[code] ?? [];
  // The capture group keeps the `{key}` tokens in the split, between the literals.
  const parts = t(`issueText.${code}`).split(/(\{\w+\})/);

  return (
    <>
      {parts.map((part, i) => {
        const key = /^\{(\w+)\}$/.exec(part)?.[1];
        if (key == null || !(key in resolved)) return part;
        const value = String(resolved[key]);
        const idx = personKeys.indexOf(key);
        const id = idx >= 0 ? personIds[idx] : undefined;
        return id ? (
          <Link key={i} to={link(`/person/${id}`)} className="text-primary underline-offset-2 hover:underline">
            {value}
          </Link>
        ) : value;
      })}
    </>
  );
}
