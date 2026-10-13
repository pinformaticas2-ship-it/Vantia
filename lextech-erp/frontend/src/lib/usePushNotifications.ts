import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

// ── Notificaciones push del navegador ────────────────────────────────────────
// Un service worker sin caché (public/sw.js) que solo escucha el evento
// "push" y muestra el aviso. Este hook gestiona el ciclo de vida de la
// suscripción del navegador: pedir permiso, suscribirse a través del
// PushManager con la clave pública VAPID del servidor, y mandar esa
// suscripción al backend para que sepa a quién avisar.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Recordatorio por usuario y navegador de que esa persona tenía los avisos
// activados aquí: al cerrar sesión se anula la suscripción del navegador (ver
// soltarPushDeEsteNavegador) y, al volver a entrar, se reactiva sola sin
// tener que pulsar nada (el permiso del navegador ya está concedido).
const claveActivo = (userId: string) => `vantia.push.activo.${userId}`;
function marcarActivo(userId: string | null | undefined, activo: boolean) {
  if (!userId) return;
  try { if (activo) localStorage.setItem(claveActivo(userId), "1"); else localStorage.removeItem(claveActivo(userId)); } catch { /* sin almacenamiento */ }
}
function estabaActivo(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try { return localStorage.getItem(claveActivo(userId)) === "1"; } catch { return false; }
}

/** Al cerrar sesión (13/10/2026): que este navegador deje de recibir los
 *  avisos de esa persona -- en un ordenador compartido seguían llegando, con
 *  nombres de clientes, hasta que entrara otra. Con token, se borra ya en el
 *  servidor; sin él (sesión ya cerrada), basta con anular la suscripción del
 *  navegador: el servidor la limpia en el siguiente envío (410). */
export async function soltarPushDeEsteNavegador(token?: string | null): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    if (token) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint }),
        keepalive: true,
      }).catch(() => {});
    }
    await sub.unsubscribe();
  } catch { /* nada que soltar */ }
}

export function usePushNotifications() {
  const { getToken, isLoaded, userId } = useAuth();
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied",
  );
  const [serverEnabled, setServerEnabled] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Estado del servidor (¿hay VAPID configurada?) + registro del SW.
  useEffect(() => {
    if (!supported || !isLoaded) return;
    let cancelled = false;
    let key = "";
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch("/api/push/config", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled) return;
        setServerEnabled(Boolean(d?.data?.enabled));
        setPublicKey(d?.data?.publicKey || "");
        key = d?.data?.enabled ? (d?.data?.publicKey || "") : "";
      } catch { /* silencioso */ }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        let existing = await reg.pushManager.getSubscription();
        // Suscripción hecha con otras claves del servidor (se cambiaron): ya
        // no sirve y el servidor la rechaza. Se rehace sola.
        if (existing && key) {
          const actual = existing.options?.applicationServerKey;
          const esperada = urlBase64ToUint8Array(key);
          const iguales = actual && actual.byteLength === esperada.byteLength
            && new Uint8Array(actual).every((b, i) => b === esperada[i]);
          if (actual && !iguales) {
            await existing.unsubscribe().catch(() => false);
            existing = null;
            if (Notification.permission === "granted") marcarActivo(userId, true);
          }
        }
        // Vuelve a entrar quien los tenía activados en este navegador: se
        // reactivan solos (el permiso ya está concedido, no hace falta clic).
        if (!existing && Notification.permission === "granted" && estabaActivo(userId) && key) {
          try {
            existing = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
          } catch { existing = null; }
        }
        if (!cancelled) setSubscribed(Boolean(existing));
        // Autorreparación (08/10/2026): el navegador puede conservar una
        // suscripción que el servidor ya no tiene a nombre de este usuario
        // (caducada y limpiada, o de otra cuenta en el mismo navegador). Se
        // vuelve a registrar en cada carga: es idempotente (upsert por endpoint).
        if (existing && Notification.permission === "granted") {
          marcarActivo(userId, true);
          const t = await getToken();
          if (t) {
            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
              body: JSON.stringify({ subscription: existing.toJSON() }),
            }).catch(() => {});
          }
        }
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [supported, isLoaded, getToken, userId]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !serverEnabled || !publicKey) return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const reg = await navigator.serviceWorker.register("/sw.js");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      const token = await getToken();
      if (!token) return false;
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) return false;
      setSubscribed(true);
      marcarActivo(userId, true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, serverEnabled, publicKey, getToken, userId]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        const token = await getToken();
        if (token) {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint }),
          }).catch(() => {});
        }
      }
      setSubscribed(false);
      marcarActivo(userId, false); // desactivado a propósito: no se reactiva solo
    } finally {
      setBusy(false);
    }
  }, [supported, getToken, userId]);

  return {
    supported,
    serverEnabled,
    permission,
    subscribed,
    busy,
    canOffer: supported && serverEnabled && permission !== "denied" && !subscribed,
    subscribe,
    unsubscribe,
  };
}
