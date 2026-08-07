/**
 * Small SVG flags for the countries that turn up in a Swedish family tree.
 * Drawn rather than using emoji flags: emoji render as bare letters on
 * Windows and can't be styled. Each flag is drawn in a 30×20 box and scaled
 * by the caller; unknown codes render nothing.
 */
import type { ReactNode } from 'react';

const W = 30;
const H = 20;

/** Nordic cross: same geometry for all five, only the colours differ. */
function nordic(field: string, cross: string, inner?: string): ReactNode {
  const t = 4;            // cross thickness
  const x = 10;           // vertical bar centre
  return (
    <>
      <rect width={W} height={H} fill={field} />
      <rect x={x - t / 2} width={t} height={H} fill={cross} />
      <rect y={H / 2 - t / 2} width={W} height={t} fill={cross} />
      {inner && (
        <>
          <rect x={x - t / 2 + 1.2} width={t - 2.4} height={H} fill={inner} />
          <rect y={H / 2 - t / 2 + 1.2} width={W} height={t - 2.4} fill={inner} />
        </>
      )}
    </>
  );
}

/** Horizontal tricolour, top to bottom. */
function bars(...colors: string[]): ReactNode {
  const h = H / colors.length;
  return <>{colors.map((c, i) => <rect key={i} y={i * h} width={W} height={h} fill={c} />)}</>;
}

/** Vertical tricolour, left to right. */
function stripes(...colors: string[]): ReactNode {
  const w = W / colors.length;
  return <>{colors.map((c, i) => <rect key={i} x={i * w} width={w} height={H} fill={c} />)}</>;
}

const FLAGS: Record<string, ReactNode> = {
  SE: nordic('#006aa7', '#fecc00'),
  NO: nordic('#ba0c2f', '#fff', '#00205b'),
  DK: nordic('#c8102e', '#fff'),
  FI: nordic('#fff', '#003580'),
  IS: nordic('#02529c', '#fff', '#dc1e35'),
  DE: bars('#000', '#dd0000', '#ffce00'),
  NL: bars('#ae1c28', '#fff', '#21468b'),
  RU: bars('#fff', '#0039a6', '#d52b1e'),
  EE: bars('#0072ce', '#000', '#fff'),
  LV: bars('#9e3039', '#fff', '#9e3039'),
  PL: bars('#fff', '#dc143c'),
  AT: bars('#ed2939', '#fff', '#ed2939'),
  FR: stripes('#002395', '#fff', '#ed2939'),
  IT: stripes('#008c45', '#f4f5f0', '#cd212a'),
  BE: stripes('#000', '#fae042', '#ed2939'),
  IE: stripes('#169b62', '#fff', '#ff883e'),
  ES: (
    <>
      <rect width={W} height={H} fill="#aa151b" />
      <rect y={H / 4} width={W} height={H / 2} fill="#f1bf00" />
    </>
  ),
  CH: (
    <>
      <rect width={W} height={H} fill="#d52b1e" />
      <rect x={W / 2 - 1.6} y={H / 2 - 5} width={3.2} height={10} fill="#fff" />
      <rect x={W / 2 - 5} y={H / 2 - 1.6} width={10} height={3.2} fill="#fff" />
    </>
  ),
  US: (
    <>
      <rect width={W} height={H} fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map(i => (
        <rect key={i} y={i * (H / 13)} width={W} height={H / 13} fill="#b22234" />
      ))}
      <rect width={W * 0.42} height={H * 0.54} fill="#3c3b6e" />
      {[0, 1, 2].map(row =>
        [0, 1, 2, 3].map(col => (
          <circle
            key={`${row}-${col}`}
            cx={2 + col * 3}
            cy={2.2 + row * 3}
            r={0.7}
            fill="#fff"
          />
        )),
      )}
    </>
  ),
  CA: (
    <>
      <rect width={W} height={H} fill="#fff" />
      <rect width={W / 4} height={H} fill="#d80621" />
      <rect x={(W / 4) * 3} width={W / 4} height={H} fill="#d80621" />
      <path
        d="M15 4 l1.6 3.4 3.2-1.2 -1.3 3.3 2.5 1.2 -2.6 2 0.5 1.6 -3.2-0.6 0.2 3.4 -1.8 0 0.2-3.4 -3.2 0.6 0.5-1.6 -2.6-2 2.5-1.2 -1.3-3.3 3.2 1.2z"
        fill="#d80621"
      />
    </>
  ),
  GB: (
    <>
      <rect width={W} height={H} fill="#012169" />
      <path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" strokeWidth={4} />
      <path d="M0 0 L30 20 M30 0 L0 20" stroke="#c8102e" strokeWidth={2} />
      <rect x={W / 2 - 2.5} width={5} height={H} fill="#fff" />
      <rect y={H / 2 - 2.5} width={W} height={5} fill="#fff" />
      <rect x={W / 2 - 1.5} width={3} height={H} fill="#c8102e" />
      <rect y={H / 2 - 1.5} width={W} height={3} fill="#c8102e" />
    </>
  ),
};

export const hasFlag = (code: string | null | undefined): boolean => !!code && code in FLAGS;

/** Circular flag badge centred on (cx, cy). Renders nothing for unknown codes. */
export default function CountryFlag({ code, cx, cy, r }: {
  code: string | null | undefined;
  cx: number;
  cy: number;
  r: number;
}) {
  if (!code || !FLAGS[code]) return null;
  const clipId = `flag-${code}-${cx}-${cy}`.replace(/\./g, '_');
  const scale = (r * 2) / H;   // cover the circle; slight crop left and right
  return (
    <g aria-hidden>
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${cx - (W * scale) / 2} ${cy - r}) scale(${scale})`}>
          {FLAGS[code]}
        </g>
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fff" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={r + 0.75} fill="none" stroke="#d1d5db" strokeWidth={0.75} />
    </g>
  );
}
