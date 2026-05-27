import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { ShieldCheck, Zap, Eye } from "lucide-react";
import VantiaBrand from "../components/VantiaBrand";

const LEGAL_QUOTES = [
  { quote: "El tiempo y el consejo de un abogado son su stock comercial.", author: "Abraham Lincoln", years: "1809 - 1865" },
  { quote: "Luchen por las cosas que les importan, pero haganlo de una forma que lleve a otros a unirse a ustedes.", author: "Ruth Bader Ginsburg", years: "1933 - 2020" },
  { quote: "La ley es la razon suprema, implantada en la naturaleza, que ordena lo que debe hacerse y prohibe lo contrario.", author: "Marco Tulio Ciceron", years: "106 a.C. - 43 a.C." },
  { quote: "El derecho de un hombre a balancear su puno termina donde comienza la nariz del otro hombre.", author: "Oliver Wendell Holmes Jr.", years: "1841 - 1935" },
  { quote: "La ley no se mantiene por si misma; cada institucion legal debe ser apoyada por la opinion publica y por la participacion activa de los ciudadanos.", author: "Thurgood Marshall", years: "1908 - 1993" },
  { quote: "La justicia no tiene nada que ver con lo que sucede en una sala de audiencias; la justicia es lo que sale de ella.", author: "Clarence Darrow", years: "1857 - 1938" },
  { quote: "Para que toda pena no sea un acto de violencia de uno o de muchos contra un ciudadano particular, debe ser esencialmente publica, pronta, necesaria, la minima de las posibles.", author: "Cesare Beccaria", years: "1738 - 1794" },
  { quote: "La ley de las naciones es el respeto a la verdad y a la justicia.", author: "Mahatma Gandhi", years: "1869 - 1948" },
  { quote: "Ningun poeta ha interpretado la naturaleza con tanta libertad como un abogado interpreta la verdad.", author: "Jean Giraudoux", years: "1882 - 1944" },
];

const FEATURES = [
  { icon: ShieldCheck, text: "Encriptacion Zero-Trust de grado bancario" },
  { icon: Zap,         text: "Integracion con CENDOJ y Plaud.ai" },
  { icon: Eye,         text: "Acceso auditado y trazabilidad total" },
];

export default function PublicLanding() {
  return (
    <div className="min-h-screen flex font-sans">
      {/* ── LEFT: dark editorial panel ── */}
      <div className="hidden lg:flex w-[55%] relative overflow-hidden flex-col justify-between p-16 text-white bg-[#1d2735]">
        <div className="absolute inset-0 z-0 pointer-events-none">
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
          <p className="mt-6 max-w-md text-lg leading-relaxed text-white/75">
            Automatizacion de expedientes, investigacion con IA y gestion integral en una sola plataforma segura.
          </p>
        </div>

        <div className="relative z-10 space-y-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-2xl border border-white/14 bg-black/20 px-4 py-3 text-sm font-medium text-white/85">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#d7c08a]/15 text-[#e4cf9f]">
                <Icon size={14} />
              </div>
              {text}
            </div>
          ))}
          <p className="pt-2 text-sm font-semibold text-white/50">(c) 2026 VantIA Systems. Enterprise.</p>
        </div>
      </div>

      {/* ── RIGHT: form panel — light, immersive ── */}
      <div className="relative flex-1 flex flex-col items-center justify-center overflow-hidden"
           style={{ background: "linear-gradient(160deg, #faf5ec 0%, #f0e8d8 50%, #e8dcc8 100%)" }}>

        {/* Very subtle ambient shapes */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-[-80px] top-[-80px] w-72 h-72 rounded-full bg-[#d7c08a]/12 blur-3xl" />
          <div className="absolute left-[-60px] bottom-[-60px] w-56 h-56 rounded-full bg-[#1e2f45]/8 blur-3xl" />
        </div>

        {/* Vertical rule on the left edge — connects to dark panel */}
        <div className="absolute left-0 inset-y-0 w-px bg-gradient-to-b from-transparent via-[#d7c08a]/30 to-transparent hidden lg:block" />

        <div className="relative z-10 w-full max-w-[400px] px-8 lg:px-10">

          {/* ── Brand strip ── */}
          <div className="mb-8 flex flex-col items-center lg:items-start gap-0.5">
            <VantiaBrand size={44} subtitle="" className="justify-center lg:justify-start" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1e2f45]/45 mt-1">
              Acceso seguro
            </p>
          </div>

          {/* ── Thin gold separator ── */}
          <div className="mb-8 h-px bg-gradient-to-r from-[#b3924a]/50 via-[#b3924a]/20 to-transparent" />

          {/* ── Clerk form: no card, blends into background ── */}
          <SignedOut>
            <SignIn
              routing="hash"
              appearance={{
                variables: {
                  colorPrimary:          "#1e2f45",
                  colorBackground:       "#f0e8d8",   /* matches panel mid-tone */
                  colorInputBackground:  "#faf5ec",   /* slightly lighter for input depth */
                  colorText:             "#1e2f45",
                  colorTextSecondary:    "#6b7280",
                  borderRadius:          "12px",
                  fontFamily:            "inherit",
                },
                elements: {
                  rootBox:              "w-full",
                  /* Remove the card shell entirely */
                  card:                 "!shadow-none !border-0 !bg-transparent !p-0 !rounded-none",
                  headerTitle:          "!text-[#1e2f45] !font-black !text-2xl !text-left",
                  headerSubtitle:       "!text-[#6b7280] !text-sm !text-left",
                  /* Inputs sit on the slightly lighter cream */
                  formFieldInput:       "!bg-[#faf5ec] !border !border-[#d7c08a]/60 !rounded-xl !text-[#1e2f45] !shadow-none focus:!border-[#1e2f45]/50 focus:!ring-2 focus:!ring-[#1e2f45]/10",
                  formFieldLabel:       "!text-[#1e2f45]/70 !text-xs !font-semibold !uppercase !tracking-wider",
                  formButtonPrimary:    "!bg-[#1e2f45] hover:!bg-[#243951] !text-white !font-bold !rounded-xl !py-3 !shadow-[0_4px_18px_rgba(30,47,69,0.22)] !transition-all",
                  footerActionLink:     "!text-[#b3924a] hover:!text-[#8a6e35]",
                  footerActionText:     "!text-[#6b7280]",
                  dividerLine:          "!bg-[#d7c08a]/40",
                  dividerText:          "!text-[#9ca3af]",
                  socialButtonsBlockButton: "!bg-[#faf5ec] !border !border-[#d7c08a]/50 !rounded-xl hover:!bg-white !transition-all !shadow-none",
                  identityPreviewText:  "!text-[#1e2f45]",
                  identityPreviewEditButton: "!text-[#b3924a]",
                  formResendCodeLink:   "!text-[#b3924a]",
                  alertText:            "!text-red-600",
                  formFieldErrorText:   "!text-red-600 !text-xs",
                },
              }}
            />
          </SignedOut>

          <SignedIn>
            <div className="space-y-4 text-center">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-950">
                Sesion activa detectada.
              </div>
              <Link to="/dashboard">
                <button className="w-full rounded-2xl bg-[#1e2f45] px-4 py-4 font-bold text-white shadow-[0_4px_18px_rgba(30,47,69,0.22)] transition-all hover:bg-[#243951] active:scale-95">
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
      setIndex((c) => (c + 1) % LEGAL_QUOTES.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const q = LEGAL_QUOTES[index];
  const len = q.quote.length;
  const size =
    len > 260 ? "text-lg sm:text-xl"
    : len > 190 ? "text-xl sm:text-2xl"
    : len > 130 ? "text-2xl sm:text-3xl"
    : "text-3xl sm:text-4xl";

  return (
    <div className="max-w-2xl">
      <style>{`
        @keyframes quoteFadeSlide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="flex h-[300px] flex-col justify-between rounded-[30px] border border-white/12 bg-black/20 p-8 backdrop-blur-sm">
        <p key={index} className={`font-black leading-tight text-white ${size}`}
           style={{ animation: "quoteFadeSlide 700ms ease" }}>
          "{q.quote}"
        </p>
        <div key={`${index}-a`} style={{ animation: "quoteFadeSlide 700ms ease" }}>
          <p className="text-base font-bold text-[#fff1c9]">{q.author}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300/70">{q.years}</p>
        </div>
      </div>
    </div>
  );
}
