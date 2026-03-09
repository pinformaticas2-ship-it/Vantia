import React, { useState } from 'react';
import { 
  Users, LayoutDashboard, Briefcase, Calendar, FileText, 
  Settings, Search, Plus, MessageSquare, Mic, BookOpen, 
  ChevronRight, Save, MessageCircle, Send, 
  ShieldCheck, MoreVertical, Bell, Lock, ArrowRight, CheckCircle2, Scale, Clock, AlertCircle, TrendingUp, Mail, HardDrive, MapPin
} from 'lucide-react';

// Hooks oficiales de Clerk
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/clerk-react";

// --- IMPORTACIÓN DE TUS COMPONENTES (Asegúrate de que estén en /src) ---
import ClientList from './pages/ClientList'; // El que creamos antes
import ClientForm from './pages/ClientForm';
import ClientDetail from './pages/ClientDetail';

// --- UTILIDADES DE UI (Tu código original) ---
const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

const Button = ({ className, variant = 'default', size = 'default', children, ...props }: any) => {
  const variants: any = {
    default: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
    outline: "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700",
    ghost: "hover:bg-slate-100 text-slate-600",
    primary: "bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-500/20",
  };
  const sizes: any = {
    default: "h-10 px-4 py-2",
    sm: "h-8 px-3 text-xs",
    icon: "h-9 w-9 rounded-full p-0 flex items-center justify-center",
  };
  return (
    <button className={cn("inline-flex items-center justify-center rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50", variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
};

const Card = ({ children, className, title }: any) => (
  <div className={cn("bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden", className)}>
    {title && <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-700 text-[10px] uppercase tracking-wider flex items-center gap-2 bg-slate-50/50">{title}</div>}
    <div className="p-0 flex-1">{children}</div>
  </div>
);

// --- PÁGINA 1: TU LOGIN CORPORATIVO (RESTAURADA) ---
function PublicLanding() {
  return (
    <div className="min-h-screen flex font-sans bg-slate-50">
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-16 text-white">
        <div className="absolute top-0 left-0 w-full h-full z-0">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-red-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px]" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-500/30">
              <Scale className="text-white" size={20} />
            </div>
            <span className="text-2xl font-bold tracking-tight">VANTIA Legis <span className="text-red-400">AI</span></span>
          </div>
          <h1 className="text-5xl font-bold leading-tight mb-6">La evolución del <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-emerald-400">Sector Legal</span></h1>
          <p className="text-slate-400 text-lg max-w-md leading-relaxed">Automatización de expedientes, investigación con IA y gestión integral en una sola plataforma segura.</p>
        </div>
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3 text-sm text-slate-300"><CheckCircle2 size={16} className="text-emerald-400" /><span>Encriptación Zero-Trust de grado bancario</span></div>
          <div className="flex items-center gap-3 text-sm text-slate-300"><CheckCircle2 size={16} className="text-emerald-400" /><span>Integración con CENDOJ y Plaud.ai</span></div>
          <div className="flex items-center gap-3 text-sm text-slate-300"><CheckCircle2 size={16} className="text-emerald-400" /><span>Acceso auditado y trazabilidad total</span></div>
        </div>
        <div className="relative z-10 text-xs text-slate-600">© 2026 VANTIA Legis Systems. V2.1 Enterprise.</div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-slate-900">Bienvenido</h2>
            <p className="text-slate-500 mt-2">Acceda a su espacio de trabajo digital.</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
            <ShieldCheck className="text-red-600" size={20} />
            <div>
              <h3 className="text-sm font-bold text-red-900">Entorno Seguro</h3>
              <p className="text-xs text-red-700 mt-0.5">Acceso monitorizado y encriptado.</p>
            </div>
          </div>
          
          {/* MODIFICACIÓN: Inyectamos el componente de Login */}
          <SignedOut>
            <SignInButton mode="modal">
              <button className="w-full group relative flex justify-center py-3.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                <span className="absolute left-0 inset-y-0 flex items-center pl-3"><Lock className="h-5 w-5 text-slate-500 group-hover:text-slate-300 transition-colors" /></span>
                Iniciar Sesión Segura
                <ArrowRight className="ml-2 h-4 w-4 opacity-50 group-hover:opacity-100 transition-all" />
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </div>
    </div>
  );
}

// --- PÁGINA 2: DASHBOARD LAYOUT COMPLETO ---
function DashboardLayout() {
  const { user } = useUser();
  const [activeModule, setActiveModule] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'expedientes', label: 'Expedientes', icon: Briefcase },
    { id: 'agenda', label: 'Agenda', icon: Calendar },
    { id: 'correo', label: 'Correo', icon: Mail },
    { id: 'documental', label: 'Documental', icon: FileText },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'equipo', label: 'Chat Equipo', icon: MessageSquare },
    { id: 'config', label: 'Configuración', icon: Settings },
  ];

  const activeItem = navItems.find(n => n.id === activeModule) || navItems[0];

  const renderContent = () => {
    // MODIFICACIÓN: Activamos los componentes reales según el estado
    if (activeModule === 'clientes') {
      return <ClientList />;
    }
    
    if (activeModule === 'dashboard') {
      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: "Expedientes", val: "142", icon: Briefcase, color: "text-red-600", bg: "bg-red-50" },
              { label: "Clientes", val: "856", icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Vencimientos", val: "3", icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
              { label: "Facturación", val: "12k€", icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50" },
            ].map((m, i) => {
              const MIcon = m.icon;
              return (
                <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{m.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{m.val}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${m.bg}`}><MIcon className={m.color} size={22} /></div>
                </div>
              );
            })}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
             <Card title="WhatsApp Business" className="lg:col-span-2">
                <div className="p-8 text-center text-slate-400 text-sm">Sincronizando mensajes de clientes...</div>
             </Card>
             <Card title="Trazabilidad">
                <div className="p-4 space-y-4 text-xs">
                   <div className="flex gap-2"><Clock size={14} className="text-red-500" /> <span>Acceso al sistema: {user?.firstName}</span></div>
                   <div className="flex gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> <span>Base de datos Clerk v3 activa</span></div>
                </div>
             </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed rounded-3xl">
        <activeItem.icon size={48} className="mb-4 opacity-20" />
        <p className="uppercase tracking-widest text-xs font-bold">Módulo {activeItem.label} en carga</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900 font-sans">
      <aside className="w-64 bg-slate-900 text-slate-400 flex flex-col border-r border-slate-800 shrink-0">
        <div className="p-6 h-16 flex items-center border-b border-slate-800 gap-3">
          <div className="h-8 w-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">V</div>
          <h1 className="text-lg font-bold text-white tracking-tight italic">VANTIA <span className="text-red-500">IA</span></h1>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveModule(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm group",
                  activeModule === item.id ? "bg-red-600 text-white shadow-lg" : "hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-800 flex items-center gap-3">
           <UserButton afterSignOutUrl="/" />
           <div className="overflow-hidden">
             <p className="text-xs font-bold text-white truncate">{user?.fullName}</p>
             <p className="text-[10px] text-slate-500 truncate">Abogado Senior</p>
           </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-between px-8 shrink-0">
          <h2 className="font-bold text-slate-800 uppercase tracking-widest text-xs flex items-center gap-2">
            <div className="h-2 w-2 bg-red-500 rounded-full" /> {activeItem.label}
          </h2>
          <Bell size={20} className="text-slate-400" />
        </header>
        <section className="flex-1 overflow-auto p-8">
          {renderContent()}
        </section>
      </main>
    </div>
  );
}

// --- ROOT APP ---
export default function App() {
  return (
    <>
      <SignedIn>
        <DashboardLayout />
      </SignedIn>
      <SignedOut>
        <PublicLanding />
      </SignedOut>
    </>
  );
}