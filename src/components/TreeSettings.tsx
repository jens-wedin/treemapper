import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t } from '../lib/i18n';
import { useAddRelativePreference, useFlagPreference, useIssueMarkPreference } from '../lib/chartPreferences';

/**
 * Everything about *how* the tree is drawn, behind one icon: how many
 * generations, and the two card toggles.
 *
 * They used to sit in a row above the chart, which made the first thing on the
 * page a wall of controls rather than the family. The generation counts stay in
 * the URL, so a link still carries them.
 */
export default function TreeSettings({
  up, down, upOptions, downOptions, showDown, onUp, onDown,
}: {
  up: number;
  down: number;
  upOptions: readonly number[];
  downOptions: readonly number[];
  /** Descendants only matter where they are drawn. */
  showDown: boolean;
  onUp: (value: string) => void;
  onDown: (value: string) => void;
}) {
  const [showFlags, setShowFlags] = useFlagPreference();
  const [showIssues, setShowIssues] = useIssueMarkPreference();
  const [addRelatives, setAddRelatives] = useAddRelativePreference();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t('tree.settings')}>
          <Settings2 aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-sm font-semibold">{t('tree.settings')}</h2>

        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="gen-upp" className="block text-sm font-medium">{t('tree.generationsUp')}</label>
            <select
              id="gen-upp"
              value={up}
              onChange={e => onUp(e.target.value)}
              className="mt-1 w-full rounded-md border px-2 py-1.5"
            >
              {upOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {showDown ? (
            <div>
              <label htmlFor="gen-ned" className="block text-sm font-medium">{t('tree.generationsDown')}</label>
              <select
                id="gen-ned"
                value={down}
                onChange={e => onDown(e.target.value)}
                className="mt-1 w-full rounded-md border px-2 py-1.5"
              >
                {downOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('tree.ancestorsOnly')}</p>
          )}
        </div>

        <div className="mt-4 space-y-2 border-t pt-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={showFlags} onChange={e => setShowFlags(e.target.checked)} />
            {t('tree.showFlags')}
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground" title={t('tree.showIssuesHint')}>
            <input type="checkbox" checked={showIssues} onChange={e => setShowIssues(e.target.checked)} />
            {t('tree.showIssues')}
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={addRelatives} onChange={e => setAddRelatives(e.target.checked)} />
            {t('tree.addRelatives')}
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
