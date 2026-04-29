import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

const GMAIL_TOKEN_KEY  = "lextech-gmail-token-v1";
const KNOWN_IDS_KEY    = "lextech-gmail-known-ids-v1";   // persiste entre recargas
const MAX_KNOWN        = 200;                             // límite para no crecer indefinidamente

interface EmailToastItem {
  id: string;
  subject: string;
  from: string;
  snippet: string;
}

interface EmailUnreadContextValue {
  unreadCount: number;
  latestUnread: EmailToastItem | null;
  clearLatestUnread: () => void;
  refreshUnread: () => Promise<void>;
}

const EmailUnreadContext = createContext<EmailUnreadContextValue>({
  unreadCount: 0,
  latestUnread: null,
  clearLatestUnread: () => {},
  refreshUnread: async () => {},
});

async function gmailReq<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail error ${res.status}`);
  return res.json();
}

function getStoredGmailToken(): string {
  try {
    const stored = JSON.parse(localStorage.getItem(GMAIL_TOKEN_KEY) || "{}");
    if (stored.expires_at && Date.now() < stored.expires_at) return stored.access_token || "";
    return "";
  } catch {
    return "";
  }
}

// Carga IDs ya vistos desde localStorage (sobreviven recargas de página)
function loadKnownIds(): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(KNOWN_IDS_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

// Guarda los IDs conocidos (solo los últimos MAX_KNOWN para no crecer sin límite)
function saveKnownIds(ids: Set<string>): void {
  try {
    const arr = [...ids].slice(-MAX_KNOWN);
    localStorage.setItem(KNOWN_IDS_KEY, JSON.stringify(arr));
  } catch { /* quota exceeded — ignorar */ }
}

export function EmailUnreadProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useAuth();
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [latestUnread, setLatestUnread] = useState<EmailToastItem | null>(null);

  // IDs que ya conocemos, cargados desde localStorage al arrancar
  const knownIdsRef    = useRef<Set<string>>(loadKnownIds());
  const didBootstrapRef = useRef(knownIdsRef.current.size > 0); // si ya hay IDs guardados, no necesitamos bootstrap
  const busyRef        = useRef(false);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!isLoaded || busyRef.current) return;
    const token = getStoredGmailToken();
    if (!token) {
      setUnreadCount(0);
      return;
    }

    busyRef.current = true;
    try {
      // Obtener conteo de no leídos
      const labels = await gmailReq<{ labels?: Array<{ id: string; messagesUnread?: number }> }>(
        token, "/labels",
      );
      const inbox = labels.labels?.find((l) => l.id === "INBOX");
      setUnreadCount(Number(inbox?.messagesUnread || 0));

      // Obtener los últimos no leídos para detectar nuevos
      const list = await gmailReq<{ messages?: Array<{ id: string }> }>(
        token,
        "/messages?labelIds=INBOX&q=is%3Aunread&maxResults=10",
      );
      const ids        = list.messages?.map((m) => m.id) || [];
      const currentSet = new Set(ids);

      if (!didBootstrapRef.current) {
        // Primera vez: registrar los IDs actuales como "ya conocidos" sin notificar
        ids.forEach(id => knownIdsRef.current.add(id));
        saveKnownIds(knownIdsRef.current);
        didBootstrapRef.current = true;
        return;
      }

      // Detectar IDs nuevos (no estaban en knownIds)
      const newIds = ids.filter((id) => !knownIdsRef.current.has(id));

      // Actualizar IDs conocidos y persistir
      ids.forEach(id => knownIdsRef.current.add(id));
      saveKnownIds(knownIdsRef.current);

      if (newIds.length > 0) {
        const message = await gmailReq<any>(
          token,
          `/messages/${newIds[0]}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        );
        const headers = message?.payload?.headers || [];
        const from    = headers.find((h: any) => String(h.name).toLowerCase() === "from")?.value || "Nuevo correo";
        const subject = headers.find((h: any) => String(h.name).toLowerCase() === "subject")?.value || "(Sin asunto)";
        setLatestUnread({ id: message.id, subject, from, snippet: message.snippet || "" });
      }
    } catch {
      // silencioso — no interrumpir la UI
    } finally {
      busyRef.current = false;
    }
  }, [isLoaded]);

  // Cuando Gmail se desconecta (token eliminado), limpiar IDs guardados
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === GMAIL_TOKEN_KEY && !e.newValue) {
        knownIdsRef.current.clear();
        saveKnownIds(knownIdsRef.current);
        didBootstrapRef.current = false;
        setUnreadCount(0);
        setLatestUnread(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    void refreshUnread();

    const startPolling = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const intervalMs = document.visibilityState === "visible" ? 12_000 : 30_000;
      timerRef.current = setInterval(() => void refreshUnread(), intervalMs);
    };

    startPolling();
    const onVisibility = () => { void refreshUnread(); startPolling(); };
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onVisibility);
    };
  }, [isLoaded, refreshUnread]);

  const value = useMemo(
    () => ({
      unreadCount,
      latestUnread,
      clearLatestUnread: () => setLatestUnread(null),
      refreshUnread,
    }),
    [latestUnread, refreshUnread, unreadCount],
  );

  return <EmailUnreadContext.Provider value={value}>{children}</EmailUnreadContext.Provider>;
}

export const useEmailUnread = () => useContext(EmailUnreadContext);
