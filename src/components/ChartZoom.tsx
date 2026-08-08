import { Button } from '@/components/ui/button';
import { t } from '../lib/i18n';
import { ZOOM_STEP } from '../lib/useChartViewport';

/**
 * Zoom, in the chart's own bottom-right corner rather than in a toolbar above
 * it. The controls belong to the canvas they act on, and putting them there
 * gives the chart the full width of the page.
 */
export default function ChartZoom({ zoomPercent, onZoom, onReset }: {
  zoomPercent: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
      <span aria-live="polite" className="px-2 text-sm tabular-nums text-muted-foreground">{zoomPercent}%</span>
      <Button variant="outline" size="sm" aria-label={t('tree.zoomOut')} onClick={() => onZoom(1 / ZOOM_STEP)}>−</Button>
      <Button variant="outline" size="sm" aria-label={t('tree.zoomIn')} onClick={() => onZoom(ZOOM_STEP)}>+</Button>
      <Button variant="outline" size="sm" onClick={onReset}>{t('tree.zoomReset')}</Button>
    </div>
  );
}
