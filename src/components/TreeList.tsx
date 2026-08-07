import { Link } from 'react-router';
import type { AncestorNode, DescendantNode, TreePerson } from '../../lib/tree';
import { t, displayName, lifespan } from '../lib/i18n';

function PersonLine({ person, depthQuery }: { person: TreePerson; depthQuery: string }) {
  return (
    <>
      <Link to={`/trad/${person.id}${depthQuery}`} className="text-blue-700 underline-offset-2 hover:underline">
        {displayName(person)}
      </Link>{' '}
      <span className="text-sm text-gray-500">{lifespan(person.birthYear, person.deathYear)}</span>{' '}
      <Link to={`/person/${person.id}`} className="text-sm text-gray-600 underline-offset-2 hover:underline">
        ({t('tree.goToPerson')})
      </Link>
    </>
  );
}

function AncestorList({ node, depthQuery }: { node: AncestorNode; depthQuery: string }) {
  if (!node.parents.length) return null;
  return (
    <ul className="ml-5 list-disc space-y-1">
      {node.parents.map((p, i) => (
        <li key={i}>
          <PersonLine person={p.person} depthQuery={depthQuery} />
          <AncestorList node={p} depthQuery={depthQuery} />
        </li>
      ))}
    </ul>
  );
}

function DescendantList({ node, depthQuery }: { node: DescendantNode; depthQuery: string }) {
  if (!node.children.length) return null;
  return (
    <ul className="ml-5 list-disc space-y-1">
      {node.children.map((c, i) => (
        <li key={i}>
          <PersonLine person={c.person} depthQuery={depthQuery} />
          {c.spouses.map(s => (
            <span key={s.id}>
              {' '}<span className="text-sm text-gray-500">{t('tree.with')}</span>{' '}
              <PersonLine person={s} depthQuery={depthQuery} />
            </span>
          ))}
          <DescendantList node={c} depthQuery={depthQuery} />
        </li>
      ))}
    </ul>
  );
}

export default function TreeList({ ancestors, descendants, depthQuery }: {
  ancestors: AncestorNode; descendants: DescendantNode; depthQuery: string;
}) {
  return (
    <div className="mt-4 grid gap-8 sm:grid-cols-2">
      <section>
        <h2 className="text-lg font-semibold">{t('tree.ancestors')}</h2>
        {ancestors.parents.length
          ? <AncestorList node={ancestors} depthQuery={depthQuery} />
          : <p className="text-gray-500">–</p>}
      </section>
      <section>
        <h2 className="text-lg font-semibold">{t('tree.descendants')}</h2>
        {descendants.children.length
          ? <DescendantList node={descendants} depthQuery={depthQuery} />
          : <p className="text-gray-500">–</p>}
      </section>
    </div>
  );
}
