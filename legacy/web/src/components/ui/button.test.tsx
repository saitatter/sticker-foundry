import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('exposes an accessible name and handles interaction', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Create pack</Button>);

    await user.click(screen.getByRole('button', { name: 'Create pack' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
