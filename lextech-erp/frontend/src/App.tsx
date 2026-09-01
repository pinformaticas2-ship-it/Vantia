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
import { useOrganizacion, Modulo } from './lib/useOrganizacion';

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
            <Route path="clientes" element={<RequireModuleAccess modulo="clientes"><ClientList /></RequireModuleAccess>} />
            <Route path="clientes/invitar" element={<RequireModuleAccess modulo="clientes"><AltaConEnlace /></RequireModuleAccess>} />
            <Route path="clientes/importar-csv" element={<RequireModuleAccess modulo="clientes"><ClientCsvImport /></RequireModuleAccess>} />
            <Route path="clientes/new" element={<RequireModuleAccess modulo="clientes"><ClientForm /></RequireModuleAccess>} />
            <Route path="clientes/:id/edit" element={<RequireModuleAccess modulo="clientes"><ClientForm /></RequireModuleAccess>} />
            <Route path="clientes/:id" element={<RequireModuleAccess modulo="clientes"><ClientDetail /></RequireModuleAccess>} />
            <Route path="procuradores" element={<RequireModuleAccess modulo="directorio"><DirectorioProfesionales tipo="PROCURADOR" title="Procuradores" singular="Procurador" desc="procuradores" /></RequireModuleAccess>} />
            <Route path="procuradores/new" element={<RequireModuleAccess modulo="directorio"><DirectorioProfesionalForm tipo="PROCURADOR" singular="Procurador" /></RequireModuleAccess>} />
            <Route path="procuradores/:id/edit" element={<RequireModuleAccess modulo="directorio"><DirectorioProfesionalForm tipo="PROCURADOR" singular="Procurador" /></RequireModuleAccess>} />
            <Route path="abogados" element={<RequireModuleAccess modulo="directorio"><DirectorioProfesionales tipo="ABOGADO" title="Abogados" singular="Abogado" desc="abogados" /></RequireModuleAccess>} />
            <Route path="abogados/new" element={<RequireModuleAccess modulo="directorio"><DirectorioProfesionalForm tipo="ABOGADO" singular="Abogado" /></RequireModuleAccess>} />
            <Route path="abogados/:id/edit" element={<RequireModuleAccess modulo="directorio"><DirectorioProfesionalForm tipo="ABOGADO" singular="Abogado" /></RequireModuleAccess>} />
            <Route path="expedientes" element={<RequireModuleAccess modulo="expedientes"><ExpedienteList /></RequireModuleAccess>} />
            <Route path="expedientes/:id" element={<RequireModuleAccess modulo="expedientes"><ExpedienteDetail /></RequireModuleAccess>} />
            <Route path="trazabilidad" element={<Trazabilidad />} />
            <Route path="agenda" element={<RequireModuleAccess modulo="agenda"><Agenda /></RequireModuleAccess>} />
            <Route path="tareas" element={<RequireModuleAccess modulo="tareas"><Tareas /></RequireModuleAccess>} />
            <Route path="chat"   element={<RequireModuleAccess modulo="chat"><Chat /></RequireModuleAccess>} />
            <Route path="whatsapp" element={<RequireModuleAccess modulo="whatsapp"><WhatsApp /></RequireModuleAccess>} />
            <Route path="correo" element={<RequireModuleAccess modulo="correo"><Email /></RequireModuleAccess>} />
            <Route path="documental" element={<RequireModuleAccess modulo="documental"><Documental /></RequireModuleAccess>} />
            <Route path="facturacion" element={<RequireAdmin><Facturacion /></RequireAdmin>} />
            <Route path="facturacion/facturas/nueva" element={<RequireAdmin><Facturacion /></RequireAdmin>} />
            <Route path="facturacion/facturas/:facturaId/editar" element={<RequireAdmin><Facturacion /></RequireAdmin>} />
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

// Bloquea el acceso a Tesorería si el usuario no es propietario/admin de la
// organización activa. Antes miraba publicMetadata.role de Clerk -- una
// fuente distinta a la que ya comprobaba el backend (organizacionRol,
// resuelta de organizacion_miembros), así que podían desincronizarse: verlo
// aquí y que el backend lo rechazase, o al revés. Ahora las dos miran lo
// mismo. Esto es solo la barrera de UI -- el backend vuelve a comprobarlo en
// cada endpoint de /api/facturacion y /api/quipu (middleware requireAdmin).
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { rol, isLoaded } = useOrganizacion();
  if (!isLoaded) return null;
  if (rol !== 'propietario' && rol !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Bloquea el acceso a un módulo según la matriz de permisos rol × módulo
// (Configuración → Gestión de usuarios → Roles y permisos). Solo la barrera
// de UI -- el backend vuelve a comprobarlo en cada request
// (requireModulePermission, montado en la ruta correspondiente).
function RequireModuleAccess({ modulo, children }: { modulo: Modulo; children: React.ReactNode }) {
  const { puede, isLoaded } = useOrganizacion();
  if (!isLoaded) return null;
  if (!puede(modulo)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
