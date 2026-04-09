import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";

// ── Tipos ────────────────────────────────────────────────────────────────────
interface ChatUnreadCtx {
  totalUnread: number;
  unreadByCanal: Record<string, number>;
  /** Mapa directo: user_id del otro usuario DM → cantidad de no-leídos */
  unreadDMs: Record<string, number>;
  unreadLoaded: boolean;
  refreshUnread: () => Promise<void>;
  clearUnread: (canalId: string, dmTargetUserId?: string | null) => void;
}

const ChatUnreadContext = createContext<ChatUnreadCtx>({
  totalUnread: 0,
  unreadByCanal: {},
  unreadDMs: {},
  unreadLoaded: false,
  refreshUnread: async () => {},
  clearUnread: () => {},
});

// ── Tipo de respuesta del endpoint /api/chat/unread ─────────────────────────
interface UnreadRow {
  canal_id: string;
  tipo: string;
  no_leidos: number;
  dm_target_user_id: string | null;
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const [unreadByCanal, setUnreadByCanal] = useState<Record<string, number>>({});
  const [unreadDMs, setUnreadDMs]         = useState<Record<string, number>>({});
  const [unreadLoaded, setUnreadLoaded]   = useState(false);

  const getTokenRef = useRef(getToken);
  const isLoadedRef = useRef(isLoaded);
  const busyRef     = useRef(false);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { getTokenRef.current = getToken; },   [getToken]);
  useEffect(() => { isLoadedRef.current = isLoaded; },   [isLoaded]);

  const doFetch = useCallback(async () => {
    if (!isLoadedRef.current) return;
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetch("/api/chat/unread", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      const items: UnreadRow[] = d.data ?? [];

      const nextByCanal: Record<string, number> = {};
      const nextDMs: Record<string, number> = {};
      for (const it of items) {
        if (it.no_leidos > 0) {
          nextByCanal[it.canal_id] = it.no_leidos;
          if (it.tipo === "directo" && it.dm_target_user_id) {
            nextDMs[it.dm_target_user_id] = it.no_leidos;
          }
        }
      }

      // Actualizar unreadByCanal solo si cambió
      setUnreadByCanal(prev => {
        const keys = new Set([...Object.keys(prev), ...Object.keys(nextByCanal)]);
        for (const k of keys) {
          if ((prev[k] ?? 0) !== (nextByCanal[k] ?? 0)) return nextByCanal;
        }
        return prev;
      });

      // Actualizar unreadDMs solo si cambió
      setUnreadDMs(prev => {
        const keys = new Set([...Object.keys(prev), ...Object.keys(nextDMs)]);
        for (const k of keys) {
          if ((prev[k] ?? 0) !== (nextDMs[k] ?? 0)) return nextDMs;
        }
        return prev;
      });

      setUnreadLoaded(true);
    } catch { /* silencioso */ }
    finally { busyRef.current = false; }
  }, []);

  // Ref siempre actualizado para usarlo en el intervalo
  const doFetchRef = useRef(doFetch);
  useEffect(() => { doFetchRef.current = doFetch; }, [doFetch]);

  const startPolling = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
    timerRef.current = setInterval(() => doFetchRef.current(), isVisible ? 1200 : 4000);
  };

  // Montar intervalo UNA sola vez — estable
  useEffect(() => {
    doFetchRef.current();
    startPolling();
    const handleVisibility = () => {
      void doFetchRef.current();
      startPolling();
    };
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshUnread = useCallback(async () => { await doFetch(); }, [doFetch]);

  const clearUnread = useCallback((canalId: string, dmTargetUserId?: string | null) => {
    setUnreadByCanal(prev => {
      if (!prev[canalId]) return prev;
      const next = { ...prev };
      delete next[canalId];
      return next;
    });
    if (dmTargetUserId) {
      setUnreadDMs(prev => {
        if (!prev[dmTargetUserId]) return prev;
        const next = { ...prev };
        delete next[dmTargetUserId];
        return next;
      });
    }
  }, []);

  const totalUnread = useMemo(
    () => Object.values(unreadByCanal).reduce((a, b) => a + b, 0),
    [unreadByCanal],
  );

  return (
    <ChatUnreadContext.Provider value={{ totalUnread, unreadByCanal, unreadDMs, unreadLoaded, refreshUnread, clearUnread }}>
      {children}
    </ChatUnreadContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export const useChatUnread = () => useContext(ChatUnreadContext);
