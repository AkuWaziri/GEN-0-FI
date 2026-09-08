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
      const saved = localStorage.getItem('gen0_theme');
      if (saved === 'grey' || saved === 'dark') return saved;
      if (saved === 'light') return 'grey'; // Migrate previous light preference to grey
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'grey') {
      root.classList.add('grey');
      root.classList.add('light'); // Keep light for backward compatibility
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('grey');
      root.classList.remove('light');
    }
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
