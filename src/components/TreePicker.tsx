import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { t } from '../lib/i18n';
import { refreshTrees, setActiveTree, useActiveTree, useTrees } from '../lib/activeTree';

/**
 * Which family tree the app is showing, and the way in to importing another.
 *
 * The import link is always here rather than only in Inställningar: someone who
 * has one tree and wants a second has no reason to look under settings for it.
 */
export default function TreePicker() {
  const trees = useTrees();
  const active = useActiveTree();
  const navigate = useNavigate();

  useEffect(() => {
    void refreshTrees();
  }, []);

  // Before the list arrives there is nothing truthful to show as selected.
  const options = trees.length ? trees : [{ id: active, name: '…' }];

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="sr-only">{t('trees.label')}</span>
        <select
          aria-label={t('trees.label')}
          value={active}
          onChange={e => {
            // A person id from one tree means nothing in another, so any page
            // showing one record has to be left behind.
            setActiveTree(e.target.value);
            void navigate('/');
          }}
          className="max-w-40 rounded-md border px-2 py-1"
        >
          {options.map(tree => (
            <option key={tree.id} value={tree.id}>{tree.name}</option>
          ))}
        </select>
      </label>
      <Link
        to="/installningar"
        title={t('trees.import')}
        className="rounded-md border px-2 py-1 underline-offset-4 hover:underline"
      >
        <span aria-hidden="true">+</span>
        <span className="sr-only">{t('trees.import')}</span>
      </Link>
    </div>
  );
}
