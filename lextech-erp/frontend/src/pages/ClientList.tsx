import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Users, Plus, ExternalLink, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
// Importamos el formulario (asegúrate de que el archivo exista)
import ClientForm from "./ClientForm"; 

export default function ClientList() {
  const { getToken } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // --- ESTADO LOCAL PARA EL BOTÓN DE ALTA ---
  const [showForm, setShowForm] = useState(false);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await fetch("http://localhost:4000/api/entities", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const result = await response.json();
      if (response.ok) setClients(result.data || result);
      else throw new Error(result.error || "Error al obtener clientes");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [getToken]);

  // --- VISTA DEL FORMULARIO ---
  if (showForm) {
    return (
      <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
        <button 
          onClick={() => setShowForm(false)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium text-sm transition-colors"
        >
          <ArrowLeft size={16} /> Volver al listado
        </button>
        <ClientForm 
          
        />
      </div>
    );
  }

  // --- VISTA DEL LISTADO (Tu código original con el botón activo) ---
  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-red-600" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Users className="text-red-600" /> Gestión de Clientes
          </h1>
          <p className="text-slate-500 text-sm">Listado centralizado de entidades y expedientes.</p>
        </div>
        
        {/* BOTÓN ACTIVADO: Ahora cambia el estado local */}
        <button 
          onClick={() => setShowForm(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-200 active:scale-95"
        >
          <Plus size={18} /> Nuevo Alta
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Titular</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identificación</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ficha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {clients.length === 0 ? (
              <tr><td colSpan={3} className="px-6 py-20 text-center text-slate-400">No hay registros.</td></tr>
            ) : (
              clients.map((client: any) => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800">{client.first_name} {client.last_name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{client.nif_cif}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg">
                      <ExternalLink size={18} />
                    </button>
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