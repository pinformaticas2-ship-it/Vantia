import React from "react";
import { useUser } from "@clerk/clerk-react";
import { 
  Users, Briefcase, FileText, AlertCircle, 
  TrendingUp, Clock, Plus, Search 
} from "lucide-react";
import { Link } from "react-router-dom";

export default function DashboardHome() {
  const { user } = useUser();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* CABECERA DE BIENVENIDA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Panel de Control</h1>
          <p className="text-slate-500">Resumen de actividad para {user?.fullName}</p>
        </div>
        <div className="flex gap-3">
          <Link to="/dashboard/clientes/new">
            <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm shadow-sm">
              <Plus size={16} /> Nuevo Cliente
            </button>
          </Link>
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-md shadow-blue-200">
            <Plus size={16} /> Nuevo Expediente
          </button>
        </div>
      </div>

      {/* TARJETAS DE MÉTRICAS (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Expedientes Activos" 
          value="142" 
          trend="+5% mes pasado" 
          icon={Briefcase} 
          color="blue" 
        />
        <MetricCard 
          title="Clientes Totales" 
          value="1,204" 
          trend="+12 nuevos" 
          icon={Users} 
          color="emerald" 
        />
        <MetricCard 
          title="Vencimientos Hoy" 
          value="3" 
          trend="Urgente" 
          icon={AlertCircle} 
          color="red" 
        />
        <MetricCard 
          title="Facturación Mes" 
          value="12.450 €" 
          trend="85% del objetivo" 
          icon={TrendingUp} 
          color="indigo" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUMNA IZQUIERDA: ACTIVIDAD RECIENTE */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Clock size={18} className="text-slate-400" /> Actividad Reciente
            </h3>
            <button className="text-blue-600 text-sm font-medium hover:underline">Ver todo</button>
          </div>
          <div className="divide-y divide-slate-50">
            <ActivityRow 
              user="Ana García" 
              action="subió un documento" 
              target="Demanda Divorcio Exp-001" 
              time="hace 10 min" 
            />
            <ActivityRow 
              user="Carlos Ruiz" 
              action="creó el cliente" 
              target="Transportes S.L." 
              time="hace 45 min" 
            />
            <ActivityRow 
              user="Sistema IA" 
              action="clasificó notificación" 
              target="Juzgado 1ª Instancia" 
              time="hace 1 hora" 
            />
            <ActivityRow 
              user={user?.firstName || "Tú"} 
              action="iniciaste sesión" 
              target="Desde IP segura" 
              time="hace 2 horas" 
            />
          </div>
        </div>

        {/* COLUMNA DERECHA: ACCESOS RÁPIDOS */}
        <div className="space-y-6">
          
          {/* Widget de Accesos */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-4">Accesos Rápidos</h3>
            <div className="grid grid-cols-2 gap-3">
              <Shortcut icon={FileText} label="Plantillas" />
              <Shortcut icon={Users} label="Agenda" />
              <Shortcut icon={Search} label="Buscar" />
              <Shortcut icon={TrendingUp} label="Informes" />
            </div>
          </div>

          {/* Widget de Estado del Sistema */}
          <div className="bg-slate-900 rounded-xl shadow-lg p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full blur-3xl opacity-20 transform translate-x-10 -translate-y-10"></div>
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Estado del Sistema
            </h3>
            <div className="space-y-2 text-sm text-slate-400">
              <div className="flex justify-between">
                <span>Base de Datos</span>
                <span className="text-green-400">Conectada</span>
              </div>
              <div className="flex justify-between">
                <span>Motor IA</span>
                <span className="text-green-400">Online</span>
              </div>
              <div className="flex justify-between">
                <span>Almacenamiento</span>
                <span className="text-blue-400">24% Ocupado</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTES PARA ORDENAR EL CÓDIGO ---

function MetricCard({ title, value, trend, icon: Icon, color }: any) {
  const colorClasses: any = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon size={22} />
        </div>
        {title === "Vencimientos Hoy" && parseInt(value) > 0 && (
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        )}
      </div>
      <p className="text-slate-500 text-sm font-medium">{title}</p>
      <div className="flex items-end gap-2 mt-1">
        <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
      </div>
      <p className={`text-xs font-medium mt-2 ${title === "Vencimientos Hoy" ? "text-red-500" : "text-emerald-600"}`}>
        {trend}
      </p>
    </div>
  );
}

function ActivityRow({ user, action, target, time }: any) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
      <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
        {user.substring(0, 2).toUpperCase()}
      </div>
      <div className="flex-1">
        <p className="text-sm text-slate-800">
          <span className="font-semibold">{user}</span> {action} <span className="font-medium text-blue-600">{target}</span>
        </p>
        <p className="text-xs text-slate-400">{time}</p>
      </div>
    </div>
  );
}

function Shortcut({ icon: Icon, label }: any) {
  return (
    <button className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-100 transition-colors group">
      <Icon size={20} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </button>
  );
}