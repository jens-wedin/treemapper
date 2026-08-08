import type { Severity } from '../../../lib/issues';

/** Each severity keeps its hue in both themes: pale wash light, deep wash dark. */
export const SEVERITY_STYLE: Record<Severity, string> = {
  error: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
  dup: 'border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-900 dark:bg-purple-950/50 dark:text-purple-200',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  info: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
  minor: 'border-border bg-muted/50 text-foreground',
};
