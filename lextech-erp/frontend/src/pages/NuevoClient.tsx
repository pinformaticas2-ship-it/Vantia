import React, { useState } from 'react';
import { User, Mail, Phone, MapPin, Save, X, AlertCircle } from 'lucide-react';

// --- COMPONENTES UI INLINE (Regla de Estabilidad #4) ---
const Input = ({ label, ...props }: any) => (
  <div className="w-full mb-4">
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    <input 
      {...props} 
      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
    />
  </div>
);

const Select = ({ label, options, ...props }: any) => (
  <div className="w-full mb-4">
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    <select 
      {...props} 
      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
    >
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

// --- COMPONENTE PRINCIPAL ---
export default function NuevoClienteForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    tipo: 'Cliente',
    nif: '12345678A',
    nombre: 'PRUEBAS',
    apellidos: 'ERP',
    email: 'infomatico@avalentia.com',
    telefono: '746359687',
    localidad: 'Orihuela'
  });

  const handleSave = async () => {
    setLoading(true);
    setError(null);

    try {
      // EL ERROR SE PRODUCE AQUÍ: La ruta probablemente devuelve un 404 (HTML)
      const response = await fetch('/api/clientes', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      // VALIDACIÓN CRÍTICA ANTES DEL .json()
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("El servidor no respondió con JSON. Verifica que la API esté activa en /api/clientes");
      }

      const data = await response.json();
      console.log("Cliente guardado:", data);
      alert("Ficha guardada con éxito");
      
    } catch (err: any) {
      // Capturamos el error para que no rompa la UI
      setError(err.message);
      console.error("Error en Guardar Ficha:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nuevo Cliente</h1>
          <p className="text-sm text-slate-500">Ficha de alta básica para el expediente.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            <X size={18} /> Cancelar
          </button>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md disabled:opacity-50"
          >
            <Save size={18} /> {loading ? 'Guardando...' : 'Guardar Ficha'}
          </button>
        </div>
      </div>

      {/* Error Alert (El que viste en rojo) */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3 items-center text-red-700">
          <AlertCircle className="text-red-500" />
          <div>
            <p className="font-bold">Error de Conexión / API</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sección Identidad */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b pb-2">
            <User className="text-slate-400" size={20} />
            <h2 className="font-semibold text-slate-700">Identidad</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select 
              label="Tipo" 
              options={['Cliente', 'Prospecto', 'Lead']} 
              value={formData.tipo}
              onChange={(e: any) => setFormData({...formData, tipo: e.target.value})}
            />
            <Input 
              label="NIF / CIF *" 
              value={formData.nif}
              onChange={(e: any) => setFormData({...formData, nif: e.target.value})}
            />
          </div>
          <Input 
            label="Nombre (Pila)" 
            value={formData.nombre}
            onChange={(e: any) => setFormData({...formData, nombre: e.target.value})}
          />
          <Input 
            label="Apellidos" 
            value={formData.apellidos}
            onChange={(e: any) => setFormData({...formData, apellidos: e.target.value})}
          />
        </div>

        {/* Sección Contacto */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b pb-2">
            <Phone className="text-slate-400" size={20} />
            <h2 className="font-semibold text-slate-700">Contacto</h2>
          </div>
          <Input 
            label="Email Principal" 
            type="email"
            icon={<Mail size={16}/>}
            value={formData.email}
            onChange={(e: any) => setFormData({...formData, email: e.target.value})}
          />
          <Input 
            label="Teléfono" 
            value={formData.telefono}
            onChange={(e: any) => setFormData({...formData, telefono: e.target.value})}
          />
          <Input 
            label="Localidad / Ciudad" 
            icon={<MapPin size={16}/>}
            value={formData.localidad}
            onChange={(e: any) => setFormData({...formData, localidad: e.target.value})}
          />
        </div>
      </div>
    </div>
  );
}