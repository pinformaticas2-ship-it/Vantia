import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SignedIn, SignedOut, SignIn, SignUp } from "@clerk/clerk-react";
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
  {
    quote: "No hay peor tiranía que la que se ejerce a la sombra de las leyes y con apariencia de justicia.",
    author: "Montesquieu",
    years: "1689 - 1755",
  },
  {
    quote: "La injusticia en cualquier lugar es una amenaza a la justicia en todas partes.",
    author: "Martin Luther King Jr.",
    years: "1929 - 1968",
  },
  {
    quote: "Para ser libres no basta con romper las propias cadenas; hay que vivir de forma que se respete y se haga crecer la libertad de los demás.",
    author: "Nelson Mandela",
    years: "1918 - 2013",
  },
  {
    quote: "Es preferible que diez culpables escapen a que sufra un solo inocente.",
    author: "William Blackstone",
    years: "1723 - 1780",
  },
  {
    quote: "Debemos ser un gobierno de leyes, y no de hombres.",
    author: "John Adams",
    years: "1735 - 1826",
  },
  {
    quote: "La ley es la razón libre de toda pasión.",
    author: "Aristóteles",
    years: "384 a.C. - 322 a.C.",
  },
  {
    quote: "La justicia es la voluntad constante y perpetua de dar a cada uno lo suyo.",
    author: "Ulpiano",
    years: "170 - 228",
  },
  {
    quote: "Se dice que la luz del sol es el mejor de los desinfectantes.",
    author: "Louis Brandeis",
    years: "1856 - 1941",
  },
  {
    quote: "La justicia retrasada es justicia denegada.",
    author: "William Gladstone",
    years: "1809 - 1898",
  },
  {
    quote: "Si eres neutral en situaciones de injusticia, has elegido el lado del opresor.",
    author: "Desmond Tutu",
    years: "1931 - 2021",
  },
];

export default function PublicLanding() {
  return (
    // En escritorio la página mide exactamente la pantalla: el panel izquierdo no
    // se estira ni se mueve cuando el formulario de la derecha crece (registro).
    <div className="min-h-screen lg:h-screen flex font-sans bg-[#f4efe6]">
      <div className="hidden lg:flex lg:h-screen w-1/2 relative overflow-hidden flex-col justify-between p-16 text-white bg-[#1d2735]">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(215,192,138,0.18),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(59,89,122,0.34),_transparent_40%)]" />
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full border border-[#d7c08a]/15" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full border border-white/8" />
        </div>

        <div className="relative z-10 w-full max-w-xl">
          <div className="mb-8 inline-flex rounded-full border border-white/20 bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-[#fff1c9]">
            Plataforma legal
          </div>

          <QuoteRotator />

          <p className="mt-6 max-w-md text-lg leading-relaxed text-white">
            Automatización de expedientes, investigación con IA y gestión integral en una sola plataforma segura.
          </p>
        </div>

        <div className="relative z-10 w-full max-w-xl space-y-3">
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
          © 2026 Vantia Systems. Enterprise.
        </div>
      </div>

      {/* Columna anclada arriba (no centrada en vertical): al pasar de «Entrar»
          a «Crear cuenta», que es más alto, la marca y las pestañas no se mueven. */}
      <div className="relative w-full lg:w-1/2 lg:h-screen flex flex-col items-center overflow-x-hidden lg:overflow-y-auto bg-[linear-gradient(180deg,#fffdf8_0%,#f5efe4_100%)] px-5 pb-12 pt-14 sm:pt-[10vh]">
        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          <div className="absolute left-[8%] top-[14%] h-24 w-24 rounded-[28px] border border-[#d7c08a]/20 bg-white/30" />
          <div className="absolute right-[14%] top-[18%] h-14 w-14 rounded-full border border-[#1e2f45]/10 bg-[#d7c08a]/10" />
          <div className="absolute left-[14%] bottom-[18%] h-20 w-20 rotate-12 rounded-[24px] border border-[#1e2f45]/10 bg-white/25" />
          <div className="absolute right-[10%] bottom-[14%] h-28 w-28 rounded-full border border-[#d7c08a]/18 bg-white/20" />
        </div>

        <div className="relative z-10 w-full max-w-[400px] space-y-7">
          {/* Marca, pestañas y formulario: misma columna, mismo ancho, centrados. */}
          <div className="flex flex-col items-center gap-1.5">
            <VantiaBrand size={64} subtitle="Suite legal profesional" className="justify-center" />
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1e2f45]/45">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" aria-hidden /> Acceso seguro
            </p>
          </div>

          <SignedOut>
            <AccesoORegistro />
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

// Apariencia común del formulario de Clerk (entrar y crear cuenta).
const APARIENCIA_ACCESO = {
  variables: {
    colorPrimary: "#1e2f45",
    colorBackground: "#ffffff",
    borderRadius: "16px",
    fontFamily: "inherit",
  },
  elements: {
    // La tarjeta ocupa todo el ancho de la columna (Clerk la fija a 25rem):
    // así queda alineada con las pestañas de encima.
    rootBox: "w-full",
    cardBox: "w-full max-w-none rounded-2xl border border-[#1e2f45]/10 shadow-[0_1px_2px_rgba(30,47,69,0.06),0_24px_48px_-12px_rgba(30,47,69,0.18)]",
    card: "w-full shadow-none border-0",
    headerTitle: "text-[#1e2f45] font-black",
    headerSubtitle: "text-[#6b7280]",
    formButtonPrimary: "bg-[#1e2f45] hover:bg-[#243951] text-white font-bold rounded-xl",
    footerActionLink: "text-[#b3924a] hover:text-[#8a6e35]",
    identityPreviewText: "text-[#1e2f45]",
  },
};

// «Iniciar sesión» / «Crear cuenta». Se entra también con /#registro (enlace
// para mandar a alguien directamente al registro) y los enlaces del pie de
// cada formulario de Clerk («¿No tienes cuenta? Regístrate») cambian de uno a
// otro sin salir de la página. Tras registrarse, la app le ofrece crear su
// despacho o unirse al de su equipo con un código (components/SinDespacho).
function AccesoORegistro() {
  const leerHash = (): "entrar" | "registro" | null =>
    window.location.hash === "#registro" ? "registro" : window.location.hash === "#entrar" ? "entrar" : null;
  const [modo, setModo] = useState<"entrar" | "registro">(() => leerHash() || "entrar");
  useEffect(() => {
    const aplicar = () => {
      const m = leerHash();
      if (!m) return; // los pasos internos de Clerk (#/factor-one, #/verify…) no cambian el modo
      setModo(m);
      // Se limpia para que el enrutado por hash de Clerk empiece en su primer paso.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    aplicar();
    window.addEventListener("hashchange", aplicar);
    return () => window.removeEventListener("hashchange", aplicar);
  }, []);

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes accesoEntrada { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>
      {/* Pestañas con indicador que se desliza; mismo ancho que la tarjeta. */}
      <div role="tablist" aria-label="Acceso" className="relative grid grid-cols-2 rounded-2xl bg-[#1e2f45]/[0.06] p-1 ring-1 ring-inset ring-[#1e2f45]/[0.06]">
        <span aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-[0_1px_2px_rgba(30,47,69,0.08),0_6px_16px_rgba(30,47,69,0.10)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: modo === "registro" ? "translateX(100%)" : "translateX(0)" }} />
        {([["entrar", "Iniciar sesión"], ["registro", "Crear cuenta"]] as const).map(([m, texto]) => (
          <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => setModo(m)}
            className={`relative z-10 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-300 ${modo === m ? "text-[#1e2f45]" : "text-[#1e2f45]/55 hover:text-[#1e2f45]/80"}`}>
            {texto}
          </button>
        ))}
      </div>
      <AlturaSuave clave={modo}>
        <div key={modo} style={{ animation: "accesoEntrada 320ms cubic-bezier(0.22,1,0.36,1)" }}>
          {modo === "entrar" ? (
            <SignIn routing="hash" signUpUrl="/#registro" appearance={APARIENCIA_ACCESO} />
          ) : (
            <>
              <SignUp routing="hash" signInUrl="/#entrar" appearance={APARIENCIA_ACCESO} />
              <p className="mt-4 px-2 text-center text-xs leading-relaxed text-[#1e2f45]/55">
                Después de crear tu cuenta podrás dar de alta tu despacho o unirte al de tu equipo con el código que te den.
              </p>
            </>
          )}
        </div>
      </AlturaSuave>
    </div>
  );
}

/**
 * La altura sigue al contenido con una transición, en vez de cambiar de golpe
 * (el registro es más alto que la entrada, y Clerk pinta su tarjeta un instante
 * después de montarse). Mientras anima recorta el desborde; en reposo no, para
 * no cortar los desplegables de Clerk (prefijo de teléfono, etc.).
 */
function AlturaSuave({ clave, children }: { clave: string; children: React.ReactNode }) {
  const interior = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number | null>(null);
  const [animando, setAnimando] = useState(false);
  const primera = useRef(true);
  // Al cambiar de formulario, Clerk monta el nuevo vacío un instante: durante
  // ese rato solo se deja crecer (si no, la caja se encoge y vuelve a estirarse).
  const soloCrecerHasta = useRef(0);
  const medirRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (primera.current) return;
    soloCrecerHasta.current = Date.now() + 700;
    const t = window.setTimeout(() => medirRef.current(), 720);
    return () => window.clearTimeout(t);
  }, [clave]);
  useLayoutEffect(() => {
    const el = interior.current; if (!el) return;
    const medir = () => {
      const h = el.offsetHeight;
      setAlto((prev) => {
        if (prev === h) return prev;
        if (prev !== null && h < prev && Date.now() < soloCrecerHasta.current) return prev;
        // La primera vez que hay contenido se coloca sin animar (aparece con el fundido).
        if (primera.current && h > 0) { primera.current = false; return h; }
        setAnimando(true);
        return h;
      });
    };
    medirRef.current = medir;
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    // El margen/relleno negativo deja sitio a la sombra de la tarjeta al recortar.
    <div className="-mx-6 -mb-10"
      onTransitionEnd={(e) => { if (e.target === e.currentTarget) setAnimando(false); }}
      style={{
        height: alto === null ? undefined : alto,
        overflow: animando ? "hidden" : "visible",
        transition: "height 380ms cubic-bezier(0.22,1,0.36,1)",
      }}>
      <div ref={interior} className="px-6 pb-10">{children}</div>
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

// Cuánto tiempo se queda cada frase en pantalla: proporcional a su longitud
// (antes eran 5s fijos para todas, y la más larga -- la de Beccaria, 280
// caracteres -- era ilegible en ese tiempo) con un mínimo y un máximo para
// que ni la más corta pase volando ni la más larga se eternice.
function quoteDurationMs(quote: string): number {
  return Math.min(9000, Math.max(4500, 3200 + quote.length * 24));
}

function QuoteRotator() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const ms = quoteDurationMs(LEGAL_QUOTES[index].quote);
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % LEGAL_QUOTES.length);
    }, ms);

    return () => window.clearTimeout(timer);
  }, [index, paused]);

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
    <div className="w-full">
      <style>{`
        @keyframes quoteFadeSlide {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative flex h-[320px] flex-col justify-between overflow-hidden rounded-[30px] border border-white/14 bg-black/20 p-8"
      >
        {/* Comilla decorativa de fondo -- puro carácter tipográfico, sin SVG */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-10 left-4 select-none font-black text-[220px] leading-none text-[#d7c08a]/10"
        >
          "
        </span>

        <p
          key={index}
          className={`relative font-black leading-tight text-white ${quoteSizeClass}`}
          style={{ animation: "quoteFadeSlide 700ms ease" }}
        >
          "{currentQuote.quote}"
        </p>
        <div
          key={`${index}-author`}
          className="relative mt-6"
          style={{ animation: "quoteFadeSlide 700ms ease" }}
        >
          <p className="text-lg font-bold text-[#fff1c9]">{currentQuote.author}</p>
          <p className="mt-1 text-sm font-medium uppercase tracking-[0.18em] text-slate-200">
            {currentQuote.years}
          </p>
        </div>
      </div>

      {/* Puntos de progreso -- de un vistazo se ve cuántas frases hay y en
          cuál vas, y se puede saltar directamente a una en concreto. */}
      <div className="mt-4 flex items-center gap-1.5">
        {LEGAL_QUOTES.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Ver frase ${i + 1} de ${LEGAL_QUOTES.length}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? "w-6 bg-[#d7c08a]" : "w-1.5 bg-white/20 hover:bg-white/35"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
