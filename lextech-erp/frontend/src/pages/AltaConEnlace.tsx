import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link2, Plus, Trash2, Copy, Check, Loader2, AlertCircle, RefreshCw, Clock, User, Tag, AlertTriangle } from "lucide-react";
import { safeJson } from "../lib/api";
import { UndoToast } from "../components/UndoToast";
import { useUndoDelete } from "../lib/useUndoDelete";

interface InviteLink {
  id: string;
  token: string;
  label: string;
  status: "pendiente" | "completado" | "expirado";
  creator_name: string;
  client_name: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function baseUrl() {
  return window.location.origin;
}

const STATUS_BADGE: Record<string, string> = {
  pendiente:  "bg-amber-100 text-amber-700",
  completado: "bg-emerald-100 text-emerald-700",
  expirado:   "bg-slate-100 text-slate-500",
};

export default function AltaConEnlace() {
  const { getToken } = useAuth();
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { pending: pendingLinkDelete, startDelete: startLinkDelete, undo: undoLinkDelete, dismiss: dismissLinkDelete } = useUndoDelete<InviteLink>({
    onDelete: async (id: string) => {
      const token = await getToken();
      await fetch(`/api/clientes/invites/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  });

  const fetchLinks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const res = await fetch("/api/clientes/invites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeJson(res);
      if (res.ok) setLinks(d.data || []);
      else throw new Error(d.error || "Error al cargar los enlaces");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const token = await getToken();
      const res = await fetch("/api/clientes/invites", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ label: label.trim() }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "Error al crear el enlace");
      setLabel("");
      await fetchLinks();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    const link = links.find(l => l.id === id);
    if (!link) return;
    setConfirmDeleteId(null);
    setLinks(prev => prev.filter(l => l.id !== id));
    startLinkDelete(id, link);
  };

  const handleUndoLink = () => {
    const item = undoLinkDelete();
    if (item) setLinks(prev => [...prev, item]);
  };

  const handleCopy = (token: string) => {
    const url = `${baseUrl()}/formulario-cliente/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-blue-50 rounded-xl">
          <Link2 className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Alta con enlace</h1>
          <p className="text-sm text-slate-500">
            Genera un enlace único para que el cliente rellene sus datos directamente.
          </p>
        </div>
      </div>

      {/* Formulario nuevo enlace */}
      <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Nuevo enlace de alta</h2>
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Etiqueta opcional (ej: Juan García - Divorcio)"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={100}
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generar enlace
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          El enlace estará activo durante 30 días y solo puede usarse una vez.
        </p>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">
            {loading ? "Cargando..." : `${links.length} enlace${links.length !== 1 ? "s" : ""}`}
          </h2>
          <button
            onClick={fetchLinks}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">Cargando enlaces...</span>
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Link2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No hay enlaces generados aún.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {links.map(link => {
              const url = `${baseUrl()}/formulario-cliente/${link.token}`;
              const isExpired = link.status === "pendiente" && new Date(link.expires_at) < new Date();
              const effectiveStatus = isExpired ? "expirado" : link.status;
              return (
                <li key={link.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Etiqueta y estado */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {link.label ? (
                          <span className="flex items-center gap-1 text-sm font-medium text-slate-800">
                            <Tag className="w-3.5 h-3.5 text-slate-400" />
                            {link.label}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400 italic">Sin etiqueta</span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_BADGE[effectiveStatus]}`}>
                          {effectiveStatus}
                        </span>
                      </div>

                      {/* URL */}
                      {link.status === "pendiente" && !isExpired && (
                        <p className="text-xs font-mono text-slate-500 truncate mb-2">{url}</p>
                      )}

                      {/* Info de uso */}
                      {link.status === "completado" && link.client_name && (
                        <p className="flex items-center gap-1 text-xs text-emerald-600 mb-1">
                          <User className="w-3.5 h-3.5" />
                          Completado por: <strong>{link.client_name}</strong>
                          {link.used_at && ` · ${fmtDate(link.used_at)}`}
                        </p>
                      )}

                      {/* Fechas */}
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Creado {fmtDate(link.created_at)}
                        </span>
                        {link.status === "pendiente" && !isExpired && (
                          <span>Expira {fmtDate(link.expires_at)}</span>
                        )}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 shrink-0">
                      {link.status === "pendiente" && !isExpired && (
                        <button
                          onClick={() => handleCopy(link.token)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          {copied === link.token ? (
                            <><Check className="w-3.5 h-3.5" /> Copiado</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" /> Copiar enlace</>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDeleteId(link.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">¿Eliminar este enlace?</h3>
                <p className="text-xs text-slate-500 mt-1">Si el cliente aún no lo ha usado, quedará invalidado. Tendrás 15 segundos para deshacer.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => handleDelete(confirmDeleteId!)} className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg active:scale-95">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {pendingLinkDelete && (
        <UndoToast
          message="Enlace eliminado"
          startedAt={pendingLinkDelete.startedAt}
          onUndo={handleUndoLink}
          onDismiss={dismissLinkDelete}
        />
      )}
    </div>
  );
}
