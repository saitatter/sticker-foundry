import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LabeledIconButton as IconButton } from '../ui/labeled-icon-button';

type Theme = 'light' | 'dark';
const THEME_KEY = 'stickerfoundry.theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme) {
      root.dataset.theme = theme;
      localStorage.setItem(THEME_KEY, theme);
    } else {
      delete root.dataset.theme;
      localStorage.removeItem(THEME_KEY);
    }
  }, [theme]);

  const dark = theme === 'dark' || (theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <IconButton
      label={dark ? 'Use light theme' : 'Use dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
