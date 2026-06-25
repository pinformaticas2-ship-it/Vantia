import React, { createContext, useContext, useEffect, useState } from 'react';

export type AppTheme = 'rojo' | 'azul';

interface ThemeCtx {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'rojo', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    return (localStorage.getItem('app-theme') as AppTheme) || 'rojo';
  });

  const setTheme = (t: AppTheme) => {
    setThemeState(t);
    localStorage.setItem('app-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
