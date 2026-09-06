import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('merges conditional and conflicting utility classes', () => {
    const hiddenClass = optionalClass(false);
    expect(cn('px-2 text-muted', hiddenClass, 'px-4')).toBe('text-muted px-4');
  });
});

function optionalClass(enabled: boolean) {
  return enabled ? 'hidden' : undefined;
}
