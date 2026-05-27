import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { ShieldCheck, Zap, Eye } from "lucide-react";
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

const FEATURES = [
  { icon: ShieldCheck, text: "Encriptacion Zero-Trust de grado bancario" },
  { icon: Zap,         text: "Integracion con CENDOJ y Plaud.ai" },
  { icon: Eye,         text: "Acceso auditado y trazabilidad total" },
];

export default function PublicLanding() {
  return (
    <div className="min-h-screen flex font-sans" style={{ background: "#111820" }}>
      {/* ── LEFT PANEL ───────────────────────────────────────────── */}
      <div className="hidden lg:flex w-[58%] relative overflow-hidden flex-col justify-between p-16 text-white bg-[#1d2735]">
        {/* Ambient gradients */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(215,192,138,0.15),_transparent_38%),radial-gradient(circle_at_bottom_left,_rgba(59,89,122,0.30),_transparent_44%)]" />
          <div className="absolute top-[-8%] right-[-8%] w-[520px] h-[520px] rounded-full border border-[#d7c08a]/10" />
          <div className="absolute bottom-[-12%] left-[-8%] w-[480px] h-[480px] rounded-full border border-white/6" />
        </div>

        <div className="relative z-10">
          <div className="mb-8 inline-flex rounded-full border border-white/20 bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-[#fff1c9]">
            Plataforma legal
          </div>
          <div className="mb-10">
            <VantiaBrand size={56} theme="dark" subtitle="Suite legal profesional" />
          </div>
          <QuoteRotator />
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/70">
            Automatizacion de expedientes, investigacion con IA y gestion integral en una sola plataforma segura.
          </p>
        </div>

        <div className="relative z-10 space-y-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 backdrop-blur-sm">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#d7c08a]/15 text-[#e4cf9f]">
                <Icon size={14} />
              </div>
              <span>{text}</span>
            </div>
          ))}
          <p className="pt-2 text-xs font-semibold text-white/40">(c) 2026 VantIA Systems. Enterprise.</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────── */}
      <div className="relative flex-1 flex flex-col justify-center overflow-hidden bg-[#111820]">
        {/* Subtle background texture */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(179,146,74,0.07)_0%,_transparent_65%)]" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#d7c08a]/20 to-transparent" />
          {/* Decorative grid lines */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.025]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d7c08a" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 w-full max-w-sm mx-auto px-8 py-10 flex flex-col gap-7">
          {/* Brand header — embedded into panel, no floating card */}
          <div className="flex flex-col items-center gap-1 text-center">
            <VantiaBrand size={44} theme="dark" subtitle="" className="justify-center" />
            <p className="text-[13px] text-white/40 font-medium tracking-wide mt-1">Acceso seguro · Suite legal</p>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-[#d7c08a]/25 to-transparent" />

          {/* Clerk form — transparent background, blends into dark panel */}
          <SignedOut>
            <SignIn
              routing="hash"
              appearance={{
                variables: {
                  colorPrimary: "#b3924a",
                  colorBackground: "transparent",
                  colorInputBackground: "rgba(255,255,255,0.05)",
                  colorInputText: "#f0ece4",
                  colorText: "#e8e2d8",
                  colorTextSecondary: "rgba(255,255,255,0.45)",
                  borderRadius: "14px",
                  fontFamily: "inherit",
                  colorNeutral: "#d7c08a",
                },
                elements: {
                  rootBox: "w-full",
                  card: "!bg-transparent !shadow-none !border-0 !p-0 !rounded-none",
                  headerTitle: "!text-white !font-black !text-2xl",
                  headerSubtitle: "!text-white/45 !text-sm",
                  formFieldLabel: "!text-white/60 !text-xs !font-semibold !uppercase !tracking-wider",
                  formFieldInput: "!bg-white/5 !border !border-white/10 !text-white !rounded-xl !px-4 !py-2.5 !text-sm focus:!border-[#b3924a]/60 focus:!ring-1 focus:!ring-[#b3924a]/30 !placeholder-white/25",
                  formButtonPrimary: "!bg-[#b3924a] hover:!bg-[#c9a85c] !text-[#111820] !font-bold !rounded-xl !py-3 !text-sm !transition-all !shadow-[0_4px_20px_rgba(179,146,74,0.35)]",
                  footerActionLink: "!text-[#b3924a] hover:!text-[#c9a85c]",
                  footerActionText: "!text-white/35",
                  dividerLine: "!bg-white/10",
                  dividerText: "!text-white/30",
                  socialButtonsBlockButton: "!bg-white/5 !border !border-white/10 !text-white !rounded-xl hover:!bg-white/10 !transition-all",
                  socialButtonsBlockButtonText: "!text-white/70",
                  identityPreviewText: "!text-white",
                  identityPreviewEditButton: "!text-[#b3924a]",
                  formResendCodeLink: "!text-[#b3924a]",
                  otpCodeFieldInput: "!bg-white/5 !border !border-white/10 !text-white !rounded-xl",
                  alertText: "!text-red-300",
                  formFieldErrorText: "!text-red-400 !text-xs",
                },
              }}
            />
          </SignedOut>

          <SignedIn>
            <div className="space-y-4 text-center">
              <div className="rounded-2xl border border-[#b3924a]/30 bg-[#b3924a]/10 p-4 text-sm font-bold text-[#e4cf9f]">
                Sesion activa detectada.
              </div>
              <Link to="/dashboard">
                <button className="w-full rounded-2xl bg-[#b3924a] px-4 py-4 font-bold text-[#111820] shadow-[0_4px_24px_rgba(179,146,74,0.35)] transition-all hover:bg-[#c9a85c] active:scale-95">
                  Entrar al dashboard
                </button>
              </Link>
            </div>
          </SignedIn>
        </div>
      </div>
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
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
      <div className="flex h-[300px] flex-col justify-between rounded-[30px] border border-white/10 bg-black/20 p-8 backdrop-blur-sm">
        <p
          key={index}
          className={`font-black leading-tight text-white ${quoteSizeClass}`}
          style={{ animation: "quoteFadeSlide 700ms ease" }}
        >
          "{currentQuote.quote}"
        </p>
        <div key={`${index}-author`} className="mt-6" style={{ animation: "quoteFadeSlide 700ms ease" }}>
          <p className="text-base font-bold text-[#fff1c9]">{currentQuote.author}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
            {currentQuote.years}
          </p>
        </div>
      </div>
    </div>
  );
}
