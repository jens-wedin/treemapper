import { useLocation, useNavigate } from 'react-router';
import { t } from '../lib/i18n';
import { useActiveTree, useTrees } from '../lib/activeTree';
import { switchTreeUrl } from '../lib/treeUrl';

/**
 * Which family tree the app is showing.
 *
 * Only the picker — importing lives in Inställningar. A shortcut in the header
 * would sit beside every page for the sake of something done once or twice.
 */
export default function TreePicker() {
  const trees = useTrees();
  const active = useActiveTree();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

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
            // Navigating is what changes the tree — the address is what the
            // rest of the app reads. It keeps you on the same kind of page,
            // but a record id from one tree means nothing in another, so those
            // are left behind.
            void navigate(switchTreeUrl(e.target.value, pathname, search));
          }}
          className="max-w-40 rounded-md border px-2 py-1"
        >
          {options.map(tree => (
            <option key={tree.id} value={tree.id}>{tree.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
