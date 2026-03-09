import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Users, Plus, Search, MoreVertical, ExternalLink, Loader2 } from "lucide-react";

// --- UI COMPONENTES INLINE (Regla de Oro #4) ---
const Badge = ({ children }: any) => (
  <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">
    {children}
  </span>
);

export default function ClientList() {
  const { getToken } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        // IMPORTANTE: El puerto debe coincidir con tu server.ts (4000)
        const response = await fetch("http://localhost:4000/api/clients", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const result = await response.json();
        
        // Manejamos si el backend devuelve { success: true, data: [] } o solo []
        if (result.success) {
          setClients(result.data);
        } else if (Array.isArray(result)) {
          setClients(result);
        }
      } catch (err: any) {
        console.error("❌ Error en ClientList:", err);
        setError(err.message);
      } finally {
        // Regla de Oro: Siempre desactivar loading para evitar el bloqueo visual
        setLoading(false);
      }
    };

    fetchClients();
  }, [getToken]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <Loader2 className="h-10 w-10 animate-spin mb-4 text-blue-600" />
        <p className="font-medium animate-pulse">Sincronizando con LexTech AI...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Users className="text-blue-600" /> Clientes
        </h1>
        <Link to="/dashboard/clientes/new">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-200">
            <Plus size={18} /> Nuevo Cliente
          </button>
        </Link>
      </div>

      {/* Tabla / Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">NIF/CIF</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                  No hay clientes registrados en la base de datos.
                </td>
              </tr>
            ) : (
              clients.map((client: any) => (
                <tr key={client.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-800">{client.first_name} {client.last_name}</p>
                    <p className="text-xs text-slate-500">{client.email}</p>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-slate-600">
                    {client.nif_cif}
                  </td>
                  <td className="px-6 py-4">
                    <Badge>Activo</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/dashboard/clientes/${client.id}`}>
                      <button className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors">
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