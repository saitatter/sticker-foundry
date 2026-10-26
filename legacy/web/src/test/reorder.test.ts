import { describe, expect, it } from 'vitest';
import { reorderIds } from '../lib/reorder';

describe('reorderIds', () => {
  it('moves the last sticker to the beginning', () => {
    expect(reorderIds(['first', 'middle', 'last'], 'last', 'first')).toEqual(['last', 'first', 'middle']);
  });

  it('moves a sticker to the position of the target', () => {
    expect(reorderIds(['first', 'middle', 'last'], 'first', 'last')).toEqual(['middle', 'last', 'first']);
  });

  it('does not change the list for invalid or identical ids', () => {
    const ids = ['first', 'middle', 'last'];
    expect(reorderIds(ids, 'missing', 'first')).toBe(ids);
    expect(reorderIds(ids, 'last', 'last')).toBe(ids);
  });
});
