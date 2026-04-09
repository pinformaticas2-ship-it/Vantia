import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { ClerkProvider } from '@clerk/clerk-react'
import { initClientIp, installBackendFetchShim } from './lib/api'

// Obtener IP pública lo antes posible — estará lista antes del primer login
installBackendFetchShim();
initClientIp();

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Log para depuración en consola
console.log("LexTech Debugger: Verificando clave de Clerk...");

if (!PUBLISHABLE_KEY) {
  throw new Error("❌ Error: No se encontró VITE_CLERK_PUBLISHABLE_KEY. Asegúrate de configurar el archivo .env.");
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* El Router DEBE estar fuera o dentro, pero solo uno. 
        Lo mantenemos aquí y lo quitamos de App.tsx obligatoriamente */}
    <BrowserRouter> 
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        appearance={{
          variables: {
            colorPrimary: '#1e2f45',
            colorPrimaryForeground: '#ffffff',
            colorForeground: '#111827',
            colorMutedForeground: '#475569',
            colorBackground: '#ffffff',
            colorInput: '#f8fafc',
            colorInputForeground: '#111827',
            colorNeutral: '#cbd5e1',
            colorBorder: '#cbd5e1',
            colorRing: '#b3924a',
            colorShadow: 'rgba(15, 23, 42, 0.16)',
            colorModalBackdrop: 'rgba(15, 23, 42, 0.72)',
            fontFamily: 'Inter, sans-serif',
            fontFamilyButtons: 'Inter, sans-serif',
            borderRadius: '1rem',
          },
          elements: {
            cardBox: {
              boxShadow: '0 24px 70px rgba(15, 23, 42, 0.22)',
              border: '1px solid #e5e7eb',
            },
            card: {
              boxShadow: 'none',
            },
            headerTitle: {
              color: '#111827',
              fontSize: '1.875rem',
              fontWeight: '800',
            },
            headerSubtitle: {
              color: '#475569',
            },
            socialButtonsBlockButton: {
              borderColor: '#cbd5e1',
              color: '#111827',
              backgroundColor: '#ffffff',
            },
            formFieldLabel: {
              color: '#111827',
              fontWeight: '700',
            },
            formFieldInput: {
              color: '#111827',
              backgroundColor: '#f8fafc',
              borderColor: '#94a3b8',
              boxShadow: 'none',
            },
            formFieldInputShowPasswordButton: {
              color: '#64748b',
            },
            identityPreviewText: {
              color: '#475569',
            },
            identityPreviewEditButton: {
              color: '#1e2f45',
            },
            formButtonPrimary: {
              backgroundColor: '#1e2f45',
              color: '#ffffff',
              boxShadow: '0 14px 32px rgba(30, 47, 69, 0.24)',
              '&:hover, &:focus, &:active': {
                backgroundColor: '#243951',
              },
            },
            footerActionText: {
              color: '#475569',
            },
            footerActionLink: {
              color: '#1e2f45',
              fontWeight: '700',
            },
            formResendCodeLink: {
              color: '#1e2f45',
              fontWeight: '700',
            },
            otpCodeFieldInput: {
              color: '#111827',
              borderColor: '#94a3b8',
              backgroundColor: '#f8fafc',
            },
            alertText: {
              color: '#111827',
            },
            alertClerkError: {
              borderColor: '#fecaca',
              backgroundColor: '#fef2f2',
            },
            footer: {
              background: 'linear-gradient(180deg, #fffdf8 0%, #f5efe4 100%)',
            },
          },
          layout: {
            logoPlacement: 'inside',
            socialButtonsPlacement: 'bottom',
            socialButtonsVariant: 'iconButton',
          },
        }}
      >
        <App />
      </ClerkProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
