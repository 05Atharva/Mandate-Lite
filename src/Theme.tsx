import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Preference = 'system' | 'light' | 'dark';
const ThemeContext = createContext<{
  preference: Preference;
  resolved: 'light' | 'dark';
  setPreference: (value: Preference) => void;
}>({ preference: 'system', resolved: 'light', setPreference: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>(() => {
    try {
      const saved = localStorage.getItem('mandate-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  });
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    try {
      localStorage.setItem('mandate-theme', preference);
    } catch {
      /* Storage can be disabled. */
    }
  }, [preference, resolved]);
  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeControl() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="theme-control" role="group" aria-label="Appearance">
      {(
        [
          { value: 'light', label: 'Light theme', Icon: Sun },
          { value: 'dark', label: 'Dark theme', Icon: Moon },
          { value: 'system', label: 'Use device theme', Icon: Monitor },
        ] as const
      ).map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
