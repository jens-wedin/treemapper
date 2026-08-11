import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { uiLocale } from '../../lib/i18n';

export interface BarRow {
  label: string | number;
  value: number;
  /** How many records the value rests on, shown as an extra column. */
  sample?: number;
}

/**
 * A bar chart that also prints its numbers. The SVG alone says nothing to a
 * screen reader, so the table is the equivalent path — the same rule the tree
 * follows with its list view.
 *
 * Callers map their own rows into `{ label, value }`. A generic version could
 * not satisfy recharts' TypedDataKey, and one concrete shape here beats casts
 * at every call site.
 */
export default function BarChartWithTable({ title, data, xLabel, yLabel, sampleLabel }: {
  title: string;
  data: readonly BarRow[];
  xLabel: string;
  yLabel: string;
  /** Column heading for the sample size; omit when the rows carry none. */
  sampleLabel?: string;
}) {
  const showSample = !!sampleLabel && data.some(r => r.sample != null);
  const config = { value: { label: yLabel, color: 'var(--chart-1)' } } satisfies ChartConfig;
  return (
    <figure>
      <figcaption className="font-medium">{title}</figcaption>
      {data.length === 0 ? (
        <p className="mt-2 text-muted-foreground">—</p>
      ) : (
        <>
          <ChartContainer config={config} className="mt-2 h-56 w-full">
            <BarChart data={[...data]} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            </BarChart>
          </ChartContainer>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left font-normal text-muted-foreground">{xLabel}</th>
                <th scope="col" className="text-right font-normal text-muted-foreground">{yLabel}</th>
                {showSample && (
                  <th scope="col" className="text-right font-normal text-muted-foreground">{sampleLabel}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={String(row.label)}>
                  <th scope="row" className="text-left font-normal">{row.label}</th>
                  <td className="text-right">{row.value.toLocaleString(uiLocale())}</td>
                  {showSample && (
                    <td className="text-right text-muted-foreground">{row.sample?.toLocaleString(uiLocale()) ?? '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}
