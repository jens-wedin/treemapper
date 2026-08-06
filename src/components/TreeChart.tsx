import { t } from '../lib/i18n';
import type { TreeLayoutResult } from '../lib/treeLayout';

// Placeholder — replaced by the interactive SVG chart in the next task.
export default function TreeChart(_props: { layout: TreeLayoutResult; depthQuery: string }) {
  return <p className="mt-4 text-gray-600">{t('common.loading')}</p>;
}
