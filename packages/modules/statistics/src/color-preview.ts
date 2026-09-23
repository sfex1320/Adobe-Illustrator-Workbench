import type { ColorDef } from '@aiq/contracts';
import type { GradientInstance } from './compute';

export function colorCss(color: Pick<ColorDef, 'kind' | 'values' | 'previewRgb'>, opacity = 100): string {
  const v = color.values;
  let rgb = color.previewRgb;
  if (color.kind === 'rgb') rgb = v;
  if (color.kind === 'process-cmyk' && v?.length === 4) rgb = [0, 1, 2].map(i => 255 * (1 - v[i]! / 100) * (1 - v[3]! / 100));
  if (color.kind === 'gray' && v?.length) rgb = [v[0]! * 2.55, v[0]! * 2.55, v[0]! * 2.55];
  return rgb ? `rgba(${rgb.map(Math.round).join(',')},${opacity / 100})` : 'repeating-linear-gradient(45deg,#777 0 3px,#aaa 3px 6px)';
}

export function gradientCss(gradient: Pick<GradientInstance, 'kind' | 'stops'>): string {
  if (!gradient.stops?.length) return '#888';
  const stops = gradient.stops.map(stop => `${stop.color ? colorCss(stop.color, stop.opacity) : '#888'} ${stop.offset}%`);
  return (gradient.kind === 'radial' ? 'radial-gradient(circle,' : 'linear-gradient(90deg,') + stops.join(',') + ')';
}
