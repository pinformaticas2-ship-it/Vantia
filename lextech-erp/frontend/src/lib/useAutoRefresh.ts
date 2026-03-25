import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook para refrescar datos automáticamente:
 * - Refresca al volver a la pestaña del navegador (visibilitychange)
 * - Refresca al reconectar (online event)
 * - Refresca periódicamente cada `intervalMs` (default 30s)
 * - Pausa el intervalo cuando la pestaña no está visible
 * - Cooldown: no refresca más de una vez cada `cooldownMs` (default 10s)
 *
 * NOTA: NO escucha 'window.focus' porque se dispara en cualquier clic
 * dentro de la ventana, causando spinners innecesarios al usuario.
 *
 * Uso:
 *   useAutoRefresh(fetchClients, { intervalMs: 30000 });
 */
export function useAutoRefresh(
  fetchFn: () => void | Promise<void>,
  options: {
    intervalMs?: number;
    enabled?: boolean;
    /** Tiempo mínimo entre refrescos automáticos en ms (default 10s) */
    cooldownMs?: number;
  } = {}
) {
  const { intervalMs = 30_000, enabled = true, cooldownMs = 10_000 } = options;
  const fetchRef   = useRef(fetchFn);
  const lastRunRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mantener referencia actualizada sin re-suscribir listeners
  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRunRef.current < cooldownMs) return; // evitar refrescos en ráfaga
    lastRunRef.current = now;
    fetchRef.current();
  }, [cooldownMs]);

  useEffect(() => {
    if (!enabled) return;

    // ── Refrescar al volver a la pestaña del navegador ──
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    // ── Refrescar al reconectar ──
    const onOnline = () => {
      refresh();
    };

    // 'focus' eliminado: se dispara con cualquier clic en la ventana,
    // causando que loadFiles muestre el spinner innecesariamente.

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    // ── Intervalo periódico (solo si pestaña visible) ──
    if (intervalMs > 0) {
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          refresh();
        }
      }, intervalMs);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, intervalMs, refresh]);

  return { refresh };
}
