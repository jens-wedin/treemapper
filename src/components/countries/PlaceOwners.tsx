import { Link } from 'react-router';
import { tf } from '../../lib/i18n';
import { useTreeId, treeUrl } from '../../lib/treeUrl';
import type { PlaceOwner } from '../../../lib/countryProposals';

/**
 * Who to go and ask about a place.
 *
 * Rejecting a wrong inference only stops it being offered again — it leaves the
 * place as wrong as it was. These links go to the record where it is actually
 * fixed, which is the whole reason for showing them.
 *
 * A marriage has no page of its own, so a family event is already resolved to
 * one of the two people by `ownersByPlace`.
 */
export default function PlaceOwners({ owners, more }: {
  owners: PlaceOwner[];
  /** How many more carry this place than are listed. */
  more: number;
}) {
  const tree = useTreeId();
  if (!owners.length) return null;

  return (
    <p className="mt-1 text-sm">
      {owners.map((owner, i) => (
        <span key={owner.id}>
          {i > 0 && <span className="text-muted-foreground">, </span>}
          <Link
            to={treeUrl(tree, `/person/${owner.id}`)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {owner.name}
          </Link>
        </span>
      ))}
      {more > 0 && (
        <span className="text-muted-foreground"> {tf('countries.andMore', { n: more })}</span>
      )}
    </p>
  );
}
