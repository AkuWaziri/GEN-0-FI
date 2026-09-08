import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'grey';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const explicitChoice = localStorage.getItem('gen0_theme_selection');
      if (explicitChoice === 'dark' || explicitChoice === 'grey') {
        return explicitChoice;
      }
      // Default to Dark Grey
      return 'grey';
    }
    return 'grey';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'grey') {
      root.classList.add('grey');
      root.classList.add('light'); // Keep for selector compatibility
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('grey');
      root.classList.remove('light');
    }
    localStorage.setItem('gen0_theme_selection', theme);
    localStorage.setItem('gen0_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'grey' : 'dark'));
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
