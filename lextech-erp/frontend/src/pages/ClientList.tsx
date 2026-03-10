import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Users, Plus, ExternalLink, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { safeJson } from "../lib/api";

export default function ClientList() {
  const { getToken } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const response = await fetch("/api/entities", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const result = await safeJson(response);
      if (response.ok) {
        setClients(result.data || []);
      } else {
        throw new Error(result.error || "Error al obtener clientes");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
        <p className="text-sm font-medium animate-pulse">Cargando clientes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Users className="text-red-600" /> Gestión de Clientes
        </h1>
        <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle size={20} className="shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-sm">Error de conexión con el backend</p>
            <p className="text-xs mt-0.5 font-mono">{error}</p>
          </div>
          <button
            onClick={fetchClients}
            className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Users className="text-red-600" /> Gestión de Clientes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {clients.length} {clients.length === 1 ? "registro" : "registros"} en la base de datos
          </p>
        </div>
        <Link to="/dashboard/clientes/new">
          <button className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-200 active:scale-95">
            <Plus size={18} /> Nuevo Alta
          </button>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Titular</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Email</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identificación</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tipo</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ficha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Users size={40} className="opacity-20" />
                    <p className="font-medium">No hay registros todavía</p>
                    <Link to="/dashboard/clientes/new">
                      <span className="text-red-600 text-sm font-bold hover:underline">+ Crear el primer cliente</span>
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              clients.map((client: any) => (
                <tr key={client.id} className="hover:bg-slate-50/70 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center text-red-700 font-bold text-sm shrink-0">
                        {(client.first_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{client.first_name} {client.last_name}</p>
                        {client.commercial_name && <p className="text-xs text-slate-400">{client.commercial_name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">
                    {client.email || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{client.nif_cif}</td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">
                      {client.type || "Cliente"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/dashboard/clientes/${client.id}`}>
                      <button className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-600 rounded-lg transition-colors">
                        <ExternalLink size={18} />
                      </button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
