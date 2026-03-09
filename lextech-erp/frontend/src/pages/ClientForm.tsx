import React, { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Save, X, User, Briefcase, Phone, Mail, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";

// --- COMPONENTES UI INLINE (Para máxima estabilidad) ---
const Button = ({ children, variant = "primary", className = "", ...props }: any) => {
  const base = "inline-flex items-center justify-center px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50";
  const variants: any = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    ghost: "text-slate-600 hover:bg-slate-100",
    outline: "border border-slate-200 text-slate-700 hover:bg-slate-50"
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
};

const Input = ({ className = "", ...props }: any) => (
  <input className={`flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${className}`} {...props} />
);

const Label = ({ children }: any) => <label className="text-sm font-medium text-slate-700">{children}</label>;

const Card = ({ children }: any) => <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">{children}</div>;
const CardHeader = ({ children }: any) => <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">{children}</div>;
const CardTitle = ({ children, className = "" }: any) => <h3 className={`font-semibold text-slate-800 ${className}`}>{children}</h3>;
const CardContent = ({ children, className = "" }: any) => <div className={`p-6 ${className}`}>{children}</div>;

export default function ClientForm() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const [formData, setFormData] = useState({
    type: "CLIENTE",
    first_name: "",
    last_name: "",
    commercial_name: "",
    nif_cif: "",
    email: "",
    phone_1: "",
    address_town: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setShowSuccess(false);

    try {
      const token = await getToken();
      const response = await fetch("/api/entities", { 
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al guardar el cliente");
      }

      setShowSuccess(true);
      setTimeout(() => navigate("/dashboard/clientes"), 2000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-in fade-in duration-500">
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Nuevo Cliente</h1>
            <p className="text-slate-500 text-sm">Ficha de alta básica para el expediente.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              <X size={18} className="mr-2" /> Cancelar
            </Button>
            <Button type="submit" disabled={loading || showSuccess} className="bg-blue-600 text-white">
              {loading ? "Guardando..." : <><Save size={18} className="mr-2" /> Guardar Ficha</>}
            </Button>
          </div>
        </div>

        {/* Mensaje de Éxito */}
        {showSuccess && (
          <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg border border-emerald-200 text-sm font-medium flex items-center gap-2 animate-bounce">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <span>¡Cliente registrado con éxito! Redirigiendo...</span>
          </div>
        )}

        {/* Mensaje de Error */}
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200 text-sm font-medium flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Identidad */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><User size={18}/> Identidad</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select 
                    name="type" 
                    value={formData.type} 
                    onChange={handleChange}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="CLIENTE">Cliente</option>
                    <option value="CONTRARIO">Contrario</option>
                    <option value="JUZGADO">Juzgado</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>NIF / CIF *</Label>
                  <Input name="nif_cif" placeholder="12345678Z" value={formData.nif_cif} onChange={handleChange} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nombre Completo</Label>
                <Input name="first_name" placeholder="Ej: Juan" value={formData.first_name} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label>Apellidos</Label>
                <Input name="last_name" placeholder="Ej: Pérez García" value={formData.last_name} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Razón Social (Empresas)</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input name="commercial_name" className="pl-9" placeholder="Ej: Transportes S.L." value={formData.commercial_name} onChange={handleChange} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contacto */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Phone size={18}/> Contacto</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email Principal</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input name="email" type="email" className="pl-9" placeholder="cliente@email.com" value={formData.email} onChange={handleChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input name="phone_1" placeholder="600 000 000" value={formData.phone_1} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Localidad / Ciudad</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input name="address_town" className="pl-9" placeholder="Madrid" value={formData.address_town} onChange={handleChange} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}