import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from "@clerk/clerk-react";

// Layouts
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import PublicLanding from './pages/PublicLanding';
import DashboardHome from './pages/DashboardHome';
import ClientList from './pages/ClientList';
import ClientForm from './pages/ClientForm';
import ClientDetail from './pages/ClientDetail';

export default function App() {
  return (
    <>
      <SignedIn>
        <Routes>
          {/* Redirigir raíz al dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Dashboard con layout compartido */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="clientes" element={<ClientList />} />
            <Route path="clientes/new" element={<ClientForm />} />
            <Route path="clientes/:id/edit" element={<ClientForm />} />
            <Route path="clientes/:id" element={<ClientDetail />} />
            {/* Módulos en construcción */}
            <Route path="expedientes" element={<ModuloEnCarga nombre="Expedientes" />} />
            <Route path="agenda" element={<ModuloEnCarga nombre="Agenda" />} />
            <Route path="documentos" element={<ModuloEnCarga nombre="Documentos" />} />
            <Route path="config" element={<ModuloEnCarga nombre="Configuración" />} />
          </Route>

          {/* Capturar rutas desconocidas */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </SignedIn>

      <SignedOut>
        <PublicLanding />
      </SignedOut>
    </>
  );
}

// Placeholder para módulos aún no implementados
function ModuloEnCarga({ nombre }: { nombre: string }) {
  return (
    <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
      <div className="h-16 w-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <p className="text-lg font-bold text-slate-500">{nombre}</p>
      <p className="text-sm text-slate-400 mt-1">Módulo en desarrollo</p>
    </div>
  );
}
