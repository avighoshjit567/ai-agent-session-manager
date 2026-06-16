import { describe, it, expect } from 'vitest';
import { colorClasses, tintClass, barClass, dotClass, swatchClass } from '../src/lib/sessionColor';

describe('colorClasses', () => {
  it('returns class strings for a known color', () => {
    const c = colorClasses('amber');
    expect(c).not.toBeNull();
    expect(c!.tint).toContain('amber');
    expect(c!.bar).toContain('amber');
    expect(c!.dot).toContain('amber');
    expect(c!.swatch).toContain('amber');
  });

  it('returns null for no color or an unknown color', () => {
    expect(colorClasses(null)).toBeNull();
    expect(colorClasses(undefined)).toBeNull();
    expect(colorClasses('chartreuse' as any)).toBeNull();
  });
});

describe('class helpers', () => {
  it('return the matching class for a known color', () => {
    expect(tintClass('sky')).toContain('sky');
    expect(barClass('sky')).toContain('sky');
    expect(dotClass('sky')).toContain('sky');
    expect(swatchClass('sky')).toContain('sky');
  });

  it('return empty string when there is no color', () => {
    expect(tintClass(null)).toBe('');
    expect(barClass(undefined)).toBe('');
    expect(dotClass('nope' as any)).toBe('');
  });
});
