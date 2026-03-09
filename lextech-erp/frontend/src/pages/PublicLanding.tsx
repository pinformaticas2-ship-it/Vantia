import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Navigate, Link } from "react-router-dom";
import { ShieldCheck, Lock, ArrowRight, CheckCircle2 } from "lucide-react";

export default function PublicLanding() {
  return (
    <div className="min-h-screen flex font-sans bg-slate-50">
      
      {/* --- COLUMNA IZQUIERDA: VISUAL & BRANDING --- */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-16 text-white">
        
        {/* Fondo con efectos de luz */}
        <div className="absolute top-0 left-0 w-full h-full z-0">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px]" />
        </div>

        {/* Contenido Marca */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="font-bold text-xl">L</span>
            </div>
            <span className="text-2xl font-bold tracking-tight">LexTech<span className="text-blue-400">AI</span></span>
          </div>
          
          <h1 className="text-5xl font-bold leading-tight mb-6">
            La evolución del <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Sector Legal
            </span>
          </h1>
          
          <p className="text-slate-400 text-lg max-w-md leading-relaxed">
            Automatización de expedientes, investigación con IA y gestión integral en una sola plataforma segura.
          </p>
        </div>

        {/* Features / Testimonio */}
        <div className="relative z-10 space-y-4">
          <FeatureRow text="Encriptación Zero-Trust de grado bancario" />
          <FeatureRow text="Integración con CENDOJ y Plaud.ai" />
          <FeatureRow text="Acceso auditado y trazabilidad total" />
        </div>

        <div className="relative z-10 text-xs text-slate-600">
          © 2026 LexTech Systems. V2.1 Enterprise.
        </div>
      </div>

      {/* --- COLUMNA DERECHA: ACCESO --- */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-slate-900">Bienvenido</h2>
            <p className="text-slate-500 mt-2">Acceda a su espacio de trabajo digital.</p>
          </div>

          {/* Tarjeta de Estado del Sistema */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-600">Sistemas Operativos: Normal</span>
          </div>

          <div className="space-y-4">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="w-full group relative flex justify-center py-3.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                  <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                    <Lock className="h-5 w-5 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </span>
                  Iniciar Sesión Segura
                  <ArrowRight className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </SignInButton>
              <div className="text-center">
                <p className="text-xs text-slate-400 mt-4">
                  Acceso restringido a personal autorizado.
                </p>
              </div>
            </SignedOut>

            <SignedIn>
              <div className="text-center space-y-4">
                <div className="p-4 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium border border-blue-100">
                  Sesión activa detectada.
                </div>
                <Link to="/dashboard">
                  <button className="w-full py-4 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-200 hover:shadow-blue-300">
                    Entrar al Dashboard
                  </button>
                </Link>
              </div>
            </SignedIn>
          </div>

        </div>
      </div>
    </div>
  );
}

function FeatureRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-300">
      <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-emerald-400">
        <CheckCircle2 size={14} />
      </div>
      <span>{text}</span>
    </div>
  );
}