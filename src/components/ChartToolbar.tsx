import { Button } from '@/components/ui/button';
import { t } from '../lib/i18n';
import { ZOOM_STEP } from '../lib/useChartViewport';

/** Zoom controls, zoom level, flag toggle and the keyboard hint. */
export default function ChartToolbar({ zoomPercent, onZoom, onReset, showFlags, onFlagsChange, hint }: {
  zoomPercent: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
  showFlags: boolean;
  onFlagsChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="outline" size="sm" aria-label={t('tree.zoomIn')} onClick={() => onZoom(ZOOM_STEP)}>+</Button>
      <Button variant="outline" size="sm" aria-label={t('tree.zoomOut')} onClick={() => onZoom(1 / ZOOM_STEP)}>−</Button>
      <Button variant="outline" size="sm" onClick={onReset}>{t('tree.zoomReset')}</Button>
      <span aria-live="polite" className="ml-2 text-sm tabular-nums text-gray-500">{zoomPercent}%</span>
      <label className="ml-3 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={showFlags} onChange={e => onFlagsChange(e.target.checked)} />
        {t('tree.showFlags')}
      </label>
      <p id="trad-instruktioner" className="ml-3 text-sm text-gray-500">
        {hint ?? t('tree.instructionsPanel')}
      </p>
    </div>
  );
}
