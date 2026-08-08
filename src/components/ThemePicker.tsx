import { useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t } from '../lib/i18n';
import { setTheme, THEMES, useTheme, type Theme } from '../lib/theme';

const ICONS: Record<Theme, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

/**
 * Light, dark or follow the system — as an icon rather than a sentence.
 *
 * A menu rather than a button that cycles: with three choices, cycling means
 * pressing twice to reach the far one and gives no way to see what the options
 * are. The trigger still says the current mode in words to a screen reader,
 * which is what the visible label used to do.
 */
export default function ThemePicker() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const Icon = ICONS[theme];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`${t('theme.label')}: ${t(`theme.${theme}`)}`}>
          <Icon aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1">
        <ul>
          {THEMES.map(mode => {
            const ModeIcon = ICONS[mode];
            return (
              <li key={mode}>
                <button
                  type="button"
                  aria-pressed={mode === theme}
                  onClick={() => { setTheme(mode); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <ModeIcon aria-hidden="true" className="size-4" />
                  {t(`theme.${mode}`)}
                  {mode === theme && <Check aria-hidden="true" className="ml-auto size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
