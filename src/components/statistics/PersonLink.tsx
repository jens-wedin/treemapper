import { Link } from 'react-router';
import type { PersonName } from '../../../lib/statistics';
import { displayName } from '../../lib/i18n';
import { useTreeUrl } from '../../lib/treeUrl';

/**
 * A person named in a statistic, linked to their page.
 *
 * Every one of these lists answers a question that immediately provokes the
 * next one — who *was* the person who lived to 104? Leaving the names as plain
 * text meant copying one into the search box to find out, which is a strange
 * thing to have to do when the record is one click away and the id is already
 * in the payload.
 */
export default function PersonLink({ person }: { person: PersonName }) {
  const link = useTreeUrl();
  return (
    <Link to={link(`/person/${person.id}`)} className="text-primary underline-offset-2 hover:underline">
      {displayName(person)}
    </Link>
  );
}

/**
 * The two halves of a marriage, each linked separately — a couple is two people
 * and either one of them may be the one being looked for.
 */
export function CoupleLinks({ husband, wife }: { husband: PersonName | null; wife: PersonName | null }) {
  if (!husband && !wife) return <>—</>;
  return (
    <>
      {husband && <PersonLink person={husband} />}
      {husband && wife && ' & '}
      {wife && <PersonLink person={wife} />}
    </>
  );
}
