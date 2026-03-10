import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  ArrowLeft, User, Mail, Phone, MapPin, Briefcase,
  Loader2, AlertCircle, Edit3, Calendar, FileText, Hash
} from "lucide-react";
import { safeJson } from "../lib/api";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchClient = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        const response = await fetch(`/api/entities/${id}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const result = await safeJson(response);
        if (response.ok) {
          setClient(result.data);
        } else {
          throw new Error(result.error || "Cliente no encontrado");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchClient();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
        <p className="text-sm font-medium animate-pulse">Cargando ficha...</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link to="/dashboard/clientes" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium text-sm transition-colors">
          <ArrowLeft size={16} /> Volver al listado
        </Link>
        <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle size={20} className="shrink-0" />
          <span className="text-sm font-medium">{error || "Cliente no encontrado"}</span>
        </div>
      </div>
    );
  }

  const initials = [(client.first_name || ""), (client.last_name || "")]
    .map((s: string) => s.charAt(0).toUpperCase()).join("") || "?";

  const typeColor: Record<string, string> = {
    CLIENTE:   "bg-emerald-100 text-emerald-700",
    CONTRARIO: "bg-red-100 text-red-700",
    JUZGADO:   "bg-blue-100 text-blue-700",
    PERITO:    "bg-purple-100 text-purple-700",
    PROVEEDOR: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/dashboard/clientes" className="hover:text-slate-800 transition-colors">Clientes</Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">{client.first_name} {client.last_name}</span>
      </div>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-red-200 shrink-0">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{client.first_name} {client.last_name}</h1>
              {client.commercial_name && <p className="text-slate-500 mt-0.5">{client.commercial_name}</p>}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${typeColor[client.type] || "bg-slate-100 text-slate-600"}`}>
                  {client.type || "Cliente"}
                </span>
                {client.nif_cif && (
                  <span className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                    <Hash size={12} className="text-slate-400" />{client.nif_cif}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft size={16} /> Volver
            </button>
            <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-sm active:scale-95">
              <Edit3 size={16} /> Editar
            </button>
          </div>
        </div>
      </div>

      {/* Datos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <h3 className="font-bold text-slate-700 text-xs uppercase tracking-widest">Información de Contacto</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoField icon={Mail}     label="Email"      value={client.email} />
            <InfoField icon={Phone}    label="Teléfono"   value={client.phone_1} />
            <InfoField icon={MapPin}   label="Localidad"  value={client.address_town} />
            <InfoField icon={Calendar} label="Alta"       value={
              client.created_at
                ? new Date(client.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
                : undefined
            } />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
              <Briefcase size={14} /> Expedientes
            </h3>
            <div className="flex flex-col items-center py-6 text-slate-400">
              <Briefcase size={32} className="opacity-20 mb-2" />
              <p className="text-xs font-medium">Sin expedientes</p>
              <button className="mt-3 text-xs font-bold text-red-600 hover:underline">+ Nuevo expediente</button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
              <FileText size={14} /> Documentos
            </h3>
            <div className="flex flex-col items-center py-6 text-slate-400">
              <FileText size={32} className="opacity-20 mb-2" />
              <p className="text-xs font-medium">Sin documentos</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({ icon: Icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
      <div className="p-2 bg-white border border-slate-100 rounded-lg shrink-0">
        <Icon size={15} className="text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-700 font-medium mt-0.5 truncate">
          {value || <span className="text-slate-300 font-normal">—</span>}
        </p>
      </div>
    </div>
  );
}
