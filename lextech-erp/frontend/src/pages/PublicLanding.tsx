import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import VantiaBrand from "../components/VantiaBrand";

const LEGAL_QUOTES = [
  {
    quote: "El tiempo y el consejo de un abogado son su stock comercial.",
    author: "Abraham Lincoln",
    years: "1809 - 1865",
  },
  {
    quote: "Luchen por las cosas que les importan, pero haganlo de una forma que lleve a otros a unirse a ustedes.",
    author: "Ruth Bader Ginsburg",
    years: "1933 - 2020",
  },
  {
    quote: "La ley es la razon suprema, implantada en la naturaleza, que ordena lo que debe hacerse y prohibe lo contrario.",
    author: "Marco Tulio Ciceron",
    years: "106 a.C. - 43 a.C.",
  },
  {
    quote: "El derecho de un hombre a balancear su puno termina donde comienza la nariz del otro hombre.",
    author: "Oliver Wendell Holmes Jr.",
    years: "1841 - 1935",
  },
  {
    quote: "La ley no se mantiene por si misma; cada institucion legal debe ser apoyada por la opinion publica y por la participacion activa de los ciudadanos.",
    author: "Thurgood Marshall",
    years: "1908 - 1993",
  },
  {
    quote: "La justicia no tiene nada que ver con lo que sucede en una sala de audiencias; la justicia es lo que sale de ella.",
    author: "Clarence Darrow",
    years: "1857 - 1938",
  },
  {
    quote: "Para que toda pena no sea un acto de violencia de uno o de muchos contra un ciudadano particular, debe ser esencialmente publica, pronta, necesaria, la minima de las posibles en las circunstancias dadas, proporcionada a los delitos y dictada por las leyes.",
    author: "Cesare Beccaria",
    years: "1738 - 1794",
  },
  {
    quote: "La ley de las naciones es el respeto a la verdad y a la justicia.",
    author: "Mahatma Gandhi",
    years: "1869 - 1948",
  },
  {
    quote: "Ningun poeta ha interpretado la naturaleza con tanta libertad como un abogado interpreta la verdad.",
    author: "Jean Giraudoux",
    years: "1882 - 1944",
  },
];

export default function PublicLanding() {
  return (
    <div className="min-h-screen flex font-sans bg-[#f4efe6]">
      <div className="hidden lg:flex w-1/2 relative overflow-hidden flex-col justify-between p-16 text-white bg-[#1d2735]">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(215,192,138,0.18),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(59,89,122,0.34),_transparent_40%)]" />
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full border border-[#d7c08a]/15" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full border border-white/8" />
        </div>

        <div className="relative z-10">
          <div className="mb-8 inline-flex rounded-full border border-white/20 bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-[#fff1c9]">
            Plataforma legal
          </div>

          <div className="mb-8">
            <VantiaBrand size={56} theme="dark" subtitle="Suite legal profesional" />
          </div>

          <QuoteRotator />

          <p className="mt-6 max-w-md text-lg leading-relaxed text-white">
            Automatizacion de expedientes, investigacion con IA y gestion integral en una sola plataforma segura.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          <FeatureRow text="Encriptacion Zero-Trust de grado bancario" />
          <FeatureRow text="Integracion con CENDOJ y Plaud.ai" />
          <FeatureRow text="Acceso auditado y trazabilidad total" />
        </div>

        <div className="relative z-10 text-sm font-semibold text-white">
          (c) 2026 VantIA Systems. Enterprise.
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 flex flex-col items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#fffdf8_0%,#f5efe4_100%)] p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[8%] top-[14%] h-24 w-24 rounded-[28px] border border-[#d7c08a]/20 bg-white/30" />
          <div className="absolute right-[14%] top-[18%] h-14 w-14 rounded-full border border-[#1e2f45]/10 bg-[#d7c08a]/10" />
          <div className="absolute left-[14%] bottom-[18%] h-20 w-20 rotate-12 rounded-[24px] border border-[#1e2f45]/10 bg-white/25" />
          <div className="absolute right-[10%] bottom-[14%] h-28 w-28 rounded-full border border-[#d7c08a]/18 bg-white/20" />
          <div className="absolute left-1/2 top-[10%] h-px w-32 -translate-x-1/2 bg-[#b3924a]/15" />
        </div>

        <div className="relative z-10 w-full max-w-md space-y-8">
          <div className="flex justify-center lg:justify-start">
            <div className="rounded-[28px] border border-[#b3924a]/45 bg-white px-4 py-3 shadow-[0_18px_45px_rgba(30,47,69,0.12)]">
              <VantiaBrand size={42} subtitle="Acceso seguro" className="justify-center lg:justify-start" />
            </div>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-black text-[#1e2f45]">Bienvenido</h2>
            <p className="mt-2 text-base font-medium text-[#1f2937]">Acceda a su espacio de trabajo digital.</p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
            <span className="text-sm font-bold text-emerald-950">Sistemas operativos: normal</span>
          </div>

          <div className="space-y-4">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="group relative flex w-full justify-center rounded-2xl border border-transparent bg-[#1e2f45] px-4 py-4 text-sm font-bold text-white shadow-[0_18px_45px_rgba(30,47,69,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#243951] focus:outline-none focus:ring-2 focus:ring-[#1e2f45] focus:ring-offset-2">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4">
                    <Lock className="h-5 w-5 text-[#e4cf9f]" />
                  </span>
                  Iniciar sesion segura
                  <ArrowRight className="ml-2 h-4 w-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              </SignInButton>

              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <p className="text-center text-sm font-semibold text-[#111827]">
                  Acceso restringido a personal autorizado.
                </p>
              </div>
            </SignedOut>

            <SignedIn>
              <div className="text-center space-y-4">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-950 shadow-sm">
                  Sesion activa detectada.
                </div>
                <Link to="/dashboard">
                  <button className="w-full rounded-2xl bg-[#b3924a] px-4 py-4 font-bold text-[#1e2f45] shadow-[0_18px_45px_rgba(179,146,74,0.2)] transition-all hover:bg-[#c19f58]">
                    Entrar al dashboard
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
    <div className="flex items-center gap-3 rounded-2xl border border-white/18 bg-black/20 px-4 py-3 text-sm font-medium text-white">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#d7c08a]/15 text-[#e4cf9f]">
        <CheckCircle2 size={14} />
      </div>
      <span>{text}</span>
    </div>
  );
}

function QuoteRotator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % LEGAL_QUOTES.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const currentQuote = LEGAL_QUOTES[index];
  const quoteLength = currentQuote.quote.length;
  const quoteSizeClass =
    quoteLength > 260
      ? "text-lg sm:text-xl"
      : quoteLength > 190
        ? "text-xl sm:text-2xl"
        : quoteLength > 130
          ? "text-2xl sm:text-3xl"
          : "text-3xl sm:text-4xl";

  return (
    <div className="max-w-2xl">
      <style>{`
        @keyframes quoteFadeSlide {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="flex h-[320px] flex-col justify-between rounded-[30px] border border-white/14 bg-black/20 p-8 backdrop-blur-sm">
        <p
          key={index}
          className={`font-black leading-tight text-white ${quoteSizeClass}`}
          style={{ animation: "quoteFadeSlide 700ms ease" }}
        >
          "{currentQuote.quote}"
        </p>
        <div
          key={`${index}-author`}
          className="mt-6"
          style={{ animation: "quoteFadeSlide 700ms ease" }}
        >
          <p className="text-lg font-bold text-[#fff1c9]">{currentQuote.author}</p>
          <p className="mt-1 text-sm font-medium uppercase tracking-[0.18em] text-slate-200">
            {currentQuote.years}
          </p>
        </div>
      </div>
    </div>
  );
}
