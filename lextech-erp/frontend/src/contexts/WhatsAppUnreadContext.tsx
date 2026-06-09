import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

export const WA_LAST_SEEN_KEY = "lextech-wa-lastseen-v1";

export interface WaToastItem {
  contactId: string;
  name: string;
  message: string;
  created_at: string;
}

interface WhatsAppUnreadCtx {
  unreadCount: number;
  latestToast: WaToastItem | null;
  clearToast: () => void;
  markSeen: (contactId: string) => void;
  markAllSeen: (contactIds: string[]) => void;
}

const WhatsAppUnreadContext = createContext<WhatsAppUnreadCtx>({
  unreadCount: 0,
  latestToast: null,
  clearToast: () => {},
  markSeen: () => {},
  markAllSeen: () => {},
});

function loadLastSeen(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(WA_LAST_SEEN_KEY) || "{}"); } catch { return {}; }
}

function saveLastSeen(data: Record<string, string>): void {
  try { localStorage.setItem(WA_LAST_SEEN_KEY, JSON.stringify(data)); } catch {}
}

export function WhatsAppUnreadProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestToast, setLatestToast] = useState<WaToastItem | null>(null);

  const lastSeenRef     = useRef<Record<string, string>>(loadLastSeen());
  const bootstrappedRef = useRef(Object.keys(lastSeenRef.current).length > 0);
  const busyRef         = useRef(false);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const getTokenRef     = useRef(getToken);

  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const markSeen = useCallback((contactId: string) => {
    lastSeenRef.current[contactId] = new Date().toISOString();
    saveLastSeen(lastSeenRef.current);
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllSeen = useCallback((contactIds: string[]) => {
    const now = new Date().toISOString();
    for (const id of contactIds) lastSeenRef.current[id] = now;
    saveLastSeen(lastSeenRef.current);
    setUnreadCount(0);
    setLatestToast(null);
  }, []);

  const doFetch = useCallback(async () => {
    if (!isLoaded || busyRef.current) return;
    busyRef.current = true;
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetch("/api/whatsapp/contacts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const contacts: any[] = Array.isArray(data?.data) ? data.data : [];

      if (!bootstrappedRef.current) {
        for (const c of contacts) {
          if (c.last_message_direction === "inbound" && c.last_message_at && c.id) {
            lastSeenRef.current[c.id] = c.last_message_at;
          }
        }
        saveLastSeen(lastSeenRef.current);
        bootstrappedRef.current = true;
        setUnreadCount(0);
        return;
      }

      const lastSeen = lastSeenRef.current;
      let newCount = 0;
      let newestToast: WaToastItem | null = null;
      let newestTime = 0;

      for (const c of contacts) {
        if (c.last_message_direction !== "inbound" || !c.last_message_at || !c.id) continue;
        const msgTime = new Date(c.last_message_at).getTime();
        // Skip messages older than 48h
        if (Date.now() - msgTime > 48 * 60 * 60 * 1000) continue;
        const seenAt = lastSeen[c.id];
        if (seenAt && msgTime <= new Date(seenAt).getTime()) continue;

        newCount++;
        if (msgTime > newestTime) {
          newestTime = msgTime;
          const name = c.commercial_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "WhatsApp";
          newestToast = { contactId: c.id, name, message: c.last_message_body || "Nuevo mensaje de WhatsApp", created_at: c.last_message_at };
        }
      }

      setUnreadCount(newCount);
      if (newestToast) {
        setLatestToast(prev =>
          prev?.contactId === newestToast!.contactId && prev?.created_at === newestToast!.created_at
            ? prev
            : newestToast
        );
      }
    } catch { /* silencioso */ }
    finally { busyRef.current = false; }
  }, [isLoaded]);

  const doFetchRef = useRef(doFetch);
  useEffect(() => { doFetchRef.current = doFetch; }, [doFetch]);

  useEffect(() => {
    if (!isLoaded) return;
    void doFetchRef.current();
    const start = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(
        () => void doFetchRef.current(),
        document.visibilityState === "visible" ? 10_000 : 25_000,
      );
    };
    start();
    const onVis = () => { void doFetchRef.current(); start(); };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    unreadCount,
    latestToast,
    clearToast: () => setLatestToast(null),
    markSeen,
    markAllSeen,
  }), [unreadCount, latestToast, markSeen, markAllSeen]);

  return (
    <WhatsAppUnreadContext.Provider value={value}>
      {children}
    </WhatsAppUnreadContext.Provider>
  );
}

export const useWhatsAppUnread = () => useContext(WhatsAppUnreadContext);
