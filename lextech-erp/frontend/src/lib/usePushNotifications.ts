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

export function usePushNotifications() {
  const { getToken, isLoaded } = useAuth();
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
      } catch { /* silencioso */ }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(existing));
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [supported, isLoaded, getToken]);

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
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, serverEnabled, publicKey, getToken]);

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
    } finally {
      setBusy(false);
    }
  }, [supported, getToken]);

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
