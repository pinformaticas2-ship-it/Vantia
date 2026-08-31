import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
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

          <QuoteRotator />

          <p className="mt-6 max-w-md text-lg leading-relaxed text-white">
            Automatizacion de expedientes, investigacion con IA y gestion integral en una sola plataforma segura.
          </p>
        </div>

        <div className="relative z-10 space-y-3">
          <FeatureCard
            emoji="🛡️"
            title="Seguridad Zero-Trust"
            desc="Cada expediente viaja y se guarda bajo el mismo nivel de exigencia que un banco, verificado en cada paso."
          />
          <FeatureCard
            emoji="⚡"
            title="Extracción con IA"
            desc="Sube un ZIP de documentos y la IA extrae partes, juzgado, cuantías y fechas automáticamente."
          />
          <FeatureCard
            emoji="📋"
            title="Trazabilidad total"
            desc="Cada acción queda registrada con usuario, fecha y hora. Auditoría completa siempre disponible."
          />
        </div>

        <div className="relative z-10 text-sm font-semibold text-white">
          (c) 2026 Vantia Systems. Enterprise.
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 flex flex-col items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#fffdf8_0%,#f5efe4_100%)] p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[8%] top-[14%] h-24 w-24 rounded-[28px] border border-[#d7c08a]/20 bg-white/30" />
          <div className="absolute right-[14%] top-[18%] h-14 w-14 rounded-full border border-[#1e2f45]/10 bg-[#d7c08a]/10" />
          <div className="absolute left-[14%] bottom-[18%] h-20 w-20 rotate-12 rounded-[24px] border border-[#1e2f45]/10 bg-white/25" />
          <div className="absolute right-[10%] bottom-[14%] h-28 w-28 rounded-full border border-[#d7c08a]/18 bg-white/20" />
        </div>

        <div className="relative z-10 w-full max-w-md space-y-8">
          {/* Logo grande en la zona superior */}
          <div className="flex flex-col items-center lg:items-start gap-1">
            <VantiaBrand size={72} subtitle="Suite legal profesional" className="justify-center lg:justify-start" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1e2f45]/40 mt-1">
              Acceso seguro
            </p>
          </div>

          <SignedOut>
            <SignIn
              routing="hash"
              appearance={{
                variables: {
                  colorPrimary: "#1e2f45",
                  colorBackground: "#ffffff",
                  borderRadius: "16px",
                  fontFamily: "inherit",
                },
                elements: {
                  rootBox: "w-full",
                  card: "shadow-[0_18px_45px_rgba(30,47,69,0.12)] border border-[#e5e7eb] rounded-2xl",
                  headerTitle: "text-[#1e2f45] font-black",
                  headerSubtitle: "text-[#6b7280]",
                  formButtonPrimary: "bg-[#1e2f45] hover:bg-[#243951] text-white font-bold rounded-xl",
                  footerActionLink: "text-[#b3924a] hover:text-[#8a6e35]",
                  identityPreviewText: "text-[#1e2f45]",
                },
              }}
            />
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
  );
}

function FeatureCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/12 bg-black/20 px-4 py-4">
      <span className="text-xl mt-0.5 shrink-0">{emoji}</span>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/55">{desc}</p>
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
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="flex h-[320px] flex-col justify-between rounded-[30px] border border-white/14 bg-black/20 p-8">
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
