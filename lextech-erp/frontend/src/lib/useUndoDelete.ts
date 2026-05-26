import { useState, useCallback, useRef, useEffect } from "react";

export interface PendingDelete<T> {
  id: string;
  item: T;
  startedAt: number;
}

interface UseUndoDeleteOptions<T> {
  onDelete: (id: string) => Promise<void>;
  undoDuration?: number;
}

export function useUndoDelete<T>({
  onDelete,
  undoDuration = 15000,
}: UseUndoDeleteOptions<T>) {
  const [pending, setPending] = useState<PendingDelete<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startDelete = useCallback(
    (id: string, item: T) => {
      clearTimer();
      timerRef.current = setTimeout(async () => {
        try {
          await onDelete(id);
        } catch (e) {
          console.error("[useUndoDelete] Error al eliminar:", e);
        }
        setPending(null);
      }, undoDuration);
      setPending({ id, item, startedAt: Date.now() });
    },
    [onDelete, undoDuration]
  );

  const undo = useCallback((): T | null => {
    if (!pending) return null;
    clearTimer();
    const item = pending.item;
    setPending(null);
    return item;
  }, [pending]);

  const dismiss = useCallback(() => {
    setPending(null);
  }, []);

  useEffect(() => {
    return clearTimer;
  }, []);

  return { pending, startDelete, undo, dismiss };
}
