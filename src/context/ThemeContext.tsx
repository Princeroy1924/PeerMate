import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'peermate_theme_preference';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
    return 'system';
  });

  const [systemTheme, setSystemTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Listen to system color scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  const activeTheme: Theme = preference === 'system' ? systemTheme : preference;

  // Apply theme to DOM (document.documentElement)
  useEffect(() => {
    const root = document.documentElement;
    if (activeTheme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }, [activeTheme]);

  const setPreference = (newPref: ThemePreference) => {
    setPreferenceState(newPref);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newPref);
    } catch (e) {
      console.warn('Could not save theme preference:', e);
    }
  };

  const toggleTheme = () => {
    const nextTheme: ThemePreference = activeTheme === 'dark' ? 'light' : 'dark';
    setPreference(nextTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: activeTheme,
        preference,
        setPreference,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
