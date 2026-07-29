import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from './api';
import { buildThemeCss, rampFromAccent } from './themeCss';

export type AppTheme = 'rojo' | 'azul' | 'verde' | 'violeta' | 'grafito' | 'indigo' | 'custom';

const DEFAULT_CUSTOM_COLOR = '#0f766e';
const CUSTOM_STYLE_TAG_ID = 'vantia-theme-custom';

interface ThemeCtx {
  theme: AppTheme;
  customColor: string;
  setTheme: (t: AppTheme) => void;
  setCustomColor: (hex: string) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'rojo',
  customColor: DEFAULT_CUSTOM_COLOR,
  setTheme: () => {},
  setCustomColor: () => {},
});

function applyCustomStyle(hex: string) {
  let tag = document.getElementById(CUSTOM_STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = CUSTOM_STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = buildThemeCss('custom', rampFromAccent(hex));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [theme, setThemeState] = useState<AppTheme>(() => {
    return (localStorage.getItem('app-theme') as AppTheme) || 'rojo';
  });
  const [customColor, setCustomColorState] = useState<string>(() => {
    return localStorage.getItem('app-theme-custom-color') || DEFAULT_CUSTOM_COLOR;
  });
  const hasSyncedFromServer = useRef(false);
  const saveCustomColorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyTheme = (t: AppTheme, color: string) => {
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'custom') applyCustomStyle(color);
  };

  const setTheme = (t: AppTheme) => {
    setThemeState(t);
    localStorage.setItem('app-theme', t);
    applyTheme(t, customColor);
    if (isSignedIn) {
      apiFetch('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify({ theme: t, themeCustomColor: t === 'custom' ? customColor : null }),
        getToken,
      }).catch(() => {});
    }
  };

  const setCustomColor = (hex: string) => {
    setCustomColorState(hex);
    localStorage.setItem('app-theme-custom-color', hex);
    setThemeState('custom');
    localStorage.setItem('app-theme', 'custom');
    applyTheme('custom', hex);
    // El picker nativo dispara onChange en cada tick mientras se arrastra;
    // aplicar es instantáneo (arriba) pero el guardado en servidor se
    // agrupa para no disparar un PUT por cada frame de arrastre.
    if (isSignedIn) {
      if (saveCustomColorTimer.current) clearTimeout(saveCustomColorTimer.current);
      saveCustomColorTimer.current = setTimeout(() => {
        apiFetch('/api/preferences', {
          method: 'PUT',
          body: JSON.stringify({ theme: 'custom', themeCustomColor: hex }),
          getToken,
        }).catch(() => {});
      }, 400);
    }
  };

  // Aplica el tema cacheado en localStorage de inmediato (evita parpadeo al cargar).
  useEffect(() => {
    applyTheme(theme, customColor);
  }, []);

  // Una vez identificado el usuario, el tema guardado en el servidor manda
  // sobre el cacheado en este navegador (viaja con la cuenta, no con el dispositivo).
  useEffect(() => {
    if (!isLoaded || !isSignedIn || hasSyncedFromServer.current) return;
    hasSyncedFromServer.current = true;
    apiFetch('/api/preferences', { getToken })
      .then((res) => {
        const data = res?.data;
        if (!data?.theme) return;
        const serverTheme = data.theme as AppTheme;
        const serverColor = data.themeCustomColor || DEFAULT_CUSTOM_COLOR;
        setThemeState(serverTheme);
        setCustomColorState(serverColor);
        localStorage.setItem('app-theme', serverTheme);
        localStorage.setItem('app-theme-custom-color', serverColor);
        applyTheme(serverTheme, serverColor);
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn, getToken]);

  return (
    <ThemeContext.Provider value={{ theme, customColor, setTheme, setCustomColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
