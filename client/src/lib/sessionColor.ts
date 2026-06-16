import type { SessionColor } from '@shared/types';

export interface ColorClasses {
  /** Solid left accent bar. */
  bar: string;
  /** Soft row background tint (light + dark). */
  tint: string;
  /** Small solid dot (lists, dashboard, header). */
  dot: string;
  /** Swatch in the color picker. */
  swatch: string;
}

// Class strings are written out literally (not interpolated) so Tailwind's
// content scanner keeps them in the build.
const MAP: Record<SessionColor, ColorClasses> = {
  slate: { bar: 'bg-slate-400', tint: 'bg-slate-50 dark:bg-slate-400/10', dot: 'bg-slate-400', swatch: 'bg-slate-500' },
  red: { bar: 'bg-red-400', tint: 'bg-red-50 dark:bg-red-500/10', dot: 'bg-red-400', swatch: 'bg-red-500' },
  amber: { bar: 'bg-amber-400', tint: 'bg-amber-50 dark:bg-amber-500/10', dot: 'bg-amber-400', swatch: 'bg-amber-500' },
  green: { bar: 'bg-green-400', tint: 'bg-green-50 dark:bg-green-500/10', dot: 'bg-green-400', swatch: 'bg-green-500' },
  sky: { bar: 'bg-sky-400', tint: 'bg-sky-50 dark:bg-sky-500/10', dot: 'bg-sky-400', swatch: 'bg-sky-500' },
  violet: { bar: 'bg-violet-400', tint: 'bg-violet-50 dark:bg-violet-500/10', dot: 'bg-violet-400', swatch: 'bg-violet-500' },
  pink: { bar: 'bg-pink-400', tint: 'bg-pink-50 dark:bg-pink-500/10', dot: 'bg-pink-400', swatch: 'bg-pink-500' },
  gray: { bar: 'bg-gray-400', tint: 'bg-gray-100 dark:bg-gray-400/10', dot: 'bg-gray-400', swatch: 'bg-gray-500' },
};

export function colorClasses(color: SessionColor | null | undefined): ColorClasses | null {
  if (!color) return null;
  return MAP[color] ?? null;
}

export function tintClass(color: SessionColor | null | undefined): string {
  return colorClasses(color)?.tint ?? '';
}
export function barClass(color: SessionColor | null | undefined): string {
  return colorClasses(color)?.bar ?? '';
}
export function dotClass(color: SessionColor | null | undefined): string {
  return colorClasses(color)?.dot ?? '';
}
export function swatchClass(color: SessionColor | null | undefined): string {
  return colorClasses(color)?.swatch ?? '';
}
