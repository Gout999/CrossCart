'use client';

import { useState } from 'react';
import { CircleHalfIcon } from '@phosphor-icons/react/ssr';

type Theme = 'system' | 'light' | 'dark';
const themes: Theme[] = ['light', 'dark', 'system'];

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>('light');
  return <button type="button" className="theme-switch" aria-label={`Color theme: ${theme}. Switch to ${themes[(themes.indexOf(theme) + 1) % themes.length]}.`} onClick={() => {
    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    setTheme(next);
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  }}><CircleHalfIcon size={18} aria-hidden="true"/><span>{theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}</span></button>;
}
