import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from './api';
import { buildThemeCss, rampFromAccent, pickSidebarStyle, autoSidebarBorder } from './themeCss';

export type AppTheme = 'rojo' | 'azul' | 'verde' | 'violeta' | 'grafito' | 'indigo' | 'custom';

const DEFAULT_CUSTOM_COLOR = '#0f766e';
const DEFAULT_CUSTOM_SECONDARY = '#f59e0b';
const DEFAULT_CUSTOM_SIDEBAR = '#ffffff';
const CUSTOM_STYLE_TAG_ID = 'vantia-theme-custom';

interface ThemeCtx {
  theme: AppTheme;
  customColor: string;
  customSecondary: string;
  customSidebar: string;
  setTheme: (t: AppTheme) => void;
  /** Aplica y persiste los 3 colores personalizados; pasa solo los que cambien. */
  setCustomColors: (colors: { primary?: string; secondary?: string; sidebar?: string }) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'rojo',
  customColor: DEFAULT_CUSTOM_COLOR,
  customSecondary: DEFAULT_CUSTOM_SECONDARY,
  customSidebar: DEFAULT_CUSTOM_SIDEBAR,
  setTheme: () => {},
  setCustomColors: () => {},
});

function applyCustomStyle(primary: string, secondary: string, sidebar: string) {
  let tag = document.getElementById(CUSTOM_STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = CUSTOM_STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  const sidebarStyle = pickSidebarStyle(sidebar);
  tag.textContent = buildThemeCss('custom', rampFromAccent(primary), {
    secondary,
    sidebarStyle,
    sidebarBg: sidebar,
    sidebarBorder: autoSidebarBorder(sidebar, sidebarStyle),
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [theme, setThemeState] = useState<AppTheme>(() => {
    return (localStorage.getItem('app-theme') as AppTheme) || 'rojo';
  });
  const [customColor, setCustomColorState] = useState<string>(() => {
    return localStorage.getItem('app-theme-custom-color') || DEFAULT_CUSTOM_COLOR;
  });
  const [customSecondary, setCustomSecondaryState] = useState<string>(() => {
    return localStorage.getItem('app-theme-custom-secondary') || DEFAULT_CUSTOM_SECONDARY;
  });
  const [customSidebar, setCustomSidebarState] = useState<string>(() => {
    return localStorage.getItem('app-theme-custom-sidebar') || DEFAULT_CUSTOM_SIDEBAR;
  });
  const hasSyncedFromServer = useRef(false);
  const saveCustomColorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyTheme = (t: AppTheme, primary: string, secondary: string, sidebar: string) => {
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'custom') applyCustomStyle(primary, secondary, sidebar);
  };

  const setTheme = (t: AppTheme) => {
    setThemeState(t);
    localStorage.setItem('app-theme', t);
    applyTheme(t, customColor, customSecondary, customSidebar);
    if (isSignedIn) {
      apiFetch('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          theme: t,
          themeCustomColor: t === 'custom' ? customColor : null,
          themeCustomSecondary: t === 'custom' ? customSecondary : null,
          themeCustomSidebar: t === 'custom' ? customSidebar : null,
        }),
        getToken,
      }).catch(() => {});
    }
  };

  const setCustomColors = (colors: { primary?: string; secondary?: string; sidebar?: string }) => {
    const primary = colors.primary ?? customColor;
    const secondary = colors.secondary ?? customSecondary;
    const sidebar = colors.sidebar ?? customSidebar;
    setCustomColorState(primary);
    setCustomSecondaryState(secondary);
    setCustomSidebarState(sidebar);
    localStorage.setItem('app-theme-custom-color', primary);
    localStorage.setItem('app-theme-custom-secondary', secondary);
    localStorage.setItem('app-theme-custom-sidebar', sidebar);
    setThemeState('custom');
    localStorage.setItem('app-theme', 'custom');
    applyTheme('custom', primary, secondary, sidebar);
    // El picker nativo dispara onChange en cada tick mientras se arrastra;
    // aplicar es instantáneo (arriba) pero el guardado en servidor se
    // agrupa para no disparar un PUT por cada frame de arrastre.
    if (isSignedIn) {
      if (saveCustomColorTimer.current) clearTimeout(saveCustomColorTimer.current);
      saveCustomColorTimer.current = setTimeout(() => {
        apiFetch('/api/preferences', {
          method: 'PUT',
          body: JSON.stringify({
            theme: 'custom',
            themeCustomColor: primary,
            themeCustomSecondary: secondary,
            themeCustomSidebar: sidebar,
          }),
          getToken,
        }).catch(() => {});
      }, 400);
    }
  };

  // Aplica el tema cacheado en localStorage de inmediato (evita parpadeo al cargar).
  useEffect(() => {
    applyTheme(theme, customColor, customSecondary, customSidebar);
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
        const serverSecondary = data.themeCustomSecondary || DEFAULT_CUSTOM_SECONDARY;
        const serverSidebar = data.themeCustomSidebar || DEFAULT_CUSTOM_SIDEBAR;
        setThemeState(serverTheme);
        setCustomColorState(serverColor);
        setCustomSecondaryState(serverSecondary);
        setCustomSidebarState(serverSidebar);
        localStorage.setItem('app-theme', serverTheme);
        localStorage.setItem('app-theme-custom-color', serverColor);
        localStorage.setItem('app-theme-custom-secondary', serverSecondary);
        localStorage.setItem('app-theme-custom-sidebar', serverSidebar);
        applyTheme(serverTheme, serverColor, serverSecondary, serverSidebar);
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn, getToken]);

  return (
    <ThemeContext.Provider value={{ theme, customColor, customSecondary, customSidebar, setTheme, setCustomColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
