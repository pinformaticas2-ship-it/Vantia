import React, { useState } from "react";
import { 
  Outlet, 
  Link, 
  useLocation
} from "react-router-dom";
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  FileText, 
  Settings, 
  Menu,
  Search,
  X,
  Bell,
  User as UserIcon,
  ShieldCheck,
  Calendar
} from "lucide-react";
import { UserButton, useUser } from "@clerk/clerk-react";

/**
 * COMPONENTES DE UI INLINE (Regla de Oro #4)
 */
const Button = ({ children, variant = "primary", size = "default", className = "", ...props }: any) => {
  const variants: any = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-900/10",
    ghost: "hover:bg-slate-100 text-slate-600",
    outline: "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700",
    icon: "p-2 rounded-xl"
  };
  const sizes: any = {
    default: "px-4 py-2",
    icon: "h-10 w-10",
    sm: "px-3 py-1.5 text-xs"
  };
  
  return (
    <button 
      className={`inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 ${variants[variant] || variants.primary} ${sizes[size] || sizes.default} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

const SidebarContent = ({ pathname, onClose }: { pathname: string, onClose?: () => void }) => {
  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Expedientes", href: "/dashboard/expedientes", icon: Briefcase },
    { name: "Clientes", href: "/dashboard/clientes", icon: Users },
    { name: "Agenda", href: "/dashboard/agenda", icon: Calendar },
    { name: "Documentos", href: "/dashboard/documentos", icon: FileText },
    { name: "Configuración", href: "/dashboard/config", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      <div className="p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20 text-white font-black text-2xl">L</div>
          <h1 className="text-xl font-bold tracking-tighter text-white uppercase italic">LexTech <span className="text-blue-500">AI</span></h1>
        </div>
        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.4em] ml-1">Legal Brain ERP</p>
      </div>
      
      <nav className="flex-1 px-4 mt-4 space-y-1.5">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon; // Regla de Oro #3: Icono como componente

          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-200 ${
                isActive 
                  ? "bg-blue-600 text-white shadow-xl shadow-blue-900/40 translate-x-1" 
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-slate-500"}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-6">
        <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50 flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-blue-500" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-white uppercase tracking-tighter truncate">Conexión Segura</p>
            <p className="text-[9px] text-slate-500 truncate">Sincronizado</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * DASHBOARD LAYOUT PRINCIPAL
 * Sin BrowserRouter interno para evitar el error de Pantalla Blanca.
 */
export default function DashboardLayout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans antialiased text-slate-900">
      
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-72 flex-col fixed inset-y-0 z-30">
        <SidebarContent pathname={location.pathname} />
      </aside>

      {/* Menú Móvil Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative w-72 h-full shadow-2xl">
            <button 
              onClick={() => setIsMobileMenuOpen(false)} 
              className="absolute right-4 top-6 text-slate-400 hover:text-white z-10"
            >
              <X className="h-7 w-7" />
            </button>
            <SidebarContent pathname={location.pathname} onClose={() => setIsMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Contenedor Principal */}
      <main className="flex-1 md:pl-72 flex flex-col min-w-0">
        
        {/* Topbar */}
        <header className="h-20 border-b bg-white/80 backdrop-blur-md flex items-center justify-between px-6 md:px-10 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden" 
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6 text-slate-600" />
            </Button>
            
            <div className="relative group hidden lg:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="search" 
                placeholder="Buscar expedientes, clientes..." 
                className="pl-11 h-12 w-[350px] lg:w-[450px] rounded-2xl border-slate-100 bg-slate-50 text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all outline-none border hover:border-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative text-slate-500 bg-slate-50">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full border-2 border-white"></span>
            </Button>
            
            <div className="h-8 w-[1px] bg-slate-200 mx-2 hidden sm:block"></div>
            
            <div className="flex items-center gap-3 pl-2 cursor-pointer group">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">Abogado Senior</p>
                <p className="text-[10px] text-blue-600 font-bold tracking-tighter uppercase">Plan Maestro</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg border border-slate-800">
                <UserIcon className="h-5 w-5" />
              </div>
            </div>
          </div>
        </header>
        
        {/* EL OUTLET: Aquí se renderizan ClientForm, ClientDetail, etc. */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-4 md:p-8">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}