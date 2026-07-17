import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { ChatUnreadProvider } from './contexts/ChatUnreadContext';
import { EmailUnreadProvider } from './contexts/EmailUnreadContext';
import { WhatsAppUnreadProvider } from './contexts/WhatsAppUnreadContext';
import { DocumentProcessingProvider } from './contexts/DocumentProcessingContext';
import { ThemeProvider } from './lib/ThemeContext';

// Layouts
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import PublicLanding from './pages/PublicLanding';
import DashboardHome from './pages/DashboardHome';
import ClientList from './pages/ClientList';
import ClientForm from './pages/ClientForm';
import ClientDetail from './pages/ClientDetail';
import ClientCsvImport from './pages/ClientCsvImport';
import ExpedienteList from './pages/ExpedienteList';
import ExpedienteDetail from './pages/ExpedienteDetail';
import Trazabilidad from './pages/Trazabilidad';
import Agenda from './pages/Agenda';
import Tareas from './pages/Tareas';
import Chat   from './pages/Chat';
import Email  from './pages/Email';
import Documental from './pages/Documental';
import WhatsApp from './pages/WhatsApp';
import AltaConEnlace from './pages/AltaConEnlace';
import FormularioCliente from './pages/FormularioCliente';
import AgendaBookingPublic from './pages/AgendaBookingPublic';
import Facturacion from './pages/Facturacion';
import Configuracion from './pages/Configuracion';
import ChatIA from './pages/ChatIA';
import DirectorioProfesionales from './pages/DirectorioProfesionales';
import DirectorioProfesionalForm from './pages/DirectorioProfesionalForm';
import { useIsAdmin } from './lib/useIsAdmin';

export default function App() {
  return (
    <ThemeProvider>
      <>
      <SignedIn>
        <ChatUnreadProvider>
        <EmailUnreadProvider>
        <WhatsAppUnreadProvider>
        <DocumentProcessingProvider>
        <Routes>
          {/* Redirigir raíz al dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Dashboard con layout compartido */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="clientes" element={<ClientList />} />
            <Route path="clientes/invitar" element={<AltaConEnlace />} />
            <Route path="clientes/importar-csv" element={<ClientCsvImport />} />
            <Route path="clientes/new" element={<ClientForm />} />
            <Route path="clientes/:id/edit" element={<ClientForm />} />
            <Route path="clientes/:id" element={<ClientDetail />} />
            <Route path="procuradores" element={<DirectorioProfesionales tipo="PROCURADOR" title="Procuradores" singular="Procurador" desc="procuradores" />} />
            <Route path="procuradores/new" element={<DirectorioProfesionalForm tipo="PROCURADOR" singular="Procurador" />} />
            <Route path="procuradores/:id/edit" element={<DirectorioProfesionalForm tipo="PROCURADOR" singular="Procurador" />} />
            <Route path="abogados" element={<DirectorioProfesionales tipo="ABOGADO" title="Abogados" singular="Abogado" desc="abogados" />} />
            <Route path="abogados/new" element={<DirectorioProfesionalForm tipo="ABOGADO" singular="Abogado" />} />
            <Route path="abogados/:id/edit" element={<DirectorioProfesionalForm tipo="ABOGADO" singular="Abogado" />} />
            <Route path="expedientes" element={<ExpedienteList />} />
            <Route path="expedientes/:id" element={<ExpedienteDetail />} />
            <Route path="trazabilidad" element={<Trazabilidad />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="tareas" element={<Tareas />} />
            <Route path="chat"   element={<Chat />} />
            <Route path="whatsapp" element={<WhatsApp />} />
            <Route path="correo" element={<Email />} />
            <Route path="documental" element={<Documental />} />
            <Route path="facturacion" element={<RequireAdmin><Facturacion /></RequireAdmin>} />
            <Route path="facturacion/facturas/nueva" element={<RequireAdmin><Facturacion /></RequireAdmin>} />
            <Route path="facturacion/facturas/:facturaId/editar" element={<RequireAdmin><Facturacion /></RequireAdmin>} />
            <Route path="plaud-ia" element={<ModuloEnCarga nombre="Plaud IA" />} />
            <Route path="chat-ia" element={<ChatIA />} />
            <Route path="config" element={<Configuracion />} />
          </Route>

          {/* Formulario público de alta (accesible también si el usuario está logueado) */}
          <Route path="/formulario-cliente/:token" element={<FormularioCliente />} />
          {/* Página pública de reservas (Agenda de citas) */}
          <Route path="/reservar/:token" element={<AgendaBookingPublic />} />

          {/* Capturar rutas desconocidas */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </DocumentProcessingProvider>
        </WhatsAppUnreadProvider>
        </EmailUnreadProvider>
        </ChatUnreadProvider>
      </SignedIn>

      <SignedOut>
        <Routes>
          <Route path="/formulario-cliente/:token" element={<FormularioCliente />} />
          <Route path="/reservar/:token" element={<AgendaBookingPublic />} />
          <Route path="*" element={<PublicLanding />} />
        </Routes>
      </SignedOut>
      </>
    </ThemeProvider>
  );
}

// Bloquea el acceso a Tesorería si el usuario no tiene rol admin en Clerk
// (publicMetadata.role). Es solo la barrera de UI -- el backend vuelve a
// comprobarlo en cada endpoint de /api/facturacion y /api/quipu.
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoaded } = useIsAdmin();
  if (!isLoaded) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Placeholder para módulos aún no implementados
function ModuloEnCarga({ nombre }: { nombre: string }) {
  return (
    <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
      <div className="h-16 w-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-3xl">🚧</span>
      </div>
      <p className="text-lg font-semibold text-slate-500">{nombre}</p>
      <p className="text-sm text-slate-400 mt-1">Módulo en construcción</p>
    </div>
  );
}
