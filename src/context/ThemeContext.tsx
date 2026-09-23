import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'neon';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const explicitChoice = localStorage.getItem('gen0_theme_selection');

      if (explicitChoice === 'light' || explicitChoice === 'neon') {
        return explicitChoice;
      }

      // Migrate previous theme names without changing the user's selected visual mode.
      if (explicitChoice === 'dark') return 'light';
      if (explicitChoice === 'brown' || explicitChoice === 'white') return 'neon';

      return 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'neon') {
      root.classList.add('brown');
      root.classList.remove('dark');
      root.classList.remove('white');
    } else {
      root.classList.add('white');
      root.classList.remove('dark');
      root.classList.remove('brown');
    }

    localStorage.setItem('gen0_theme_selection', theme);
    localStorage.setItem('gen0_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'neon' : 'light'));
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
