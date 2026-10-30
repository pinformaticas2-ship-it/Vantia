import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Decoración temporal de Halloween para el dashboard: telaraña en la esquina,
// dos arañas colgando de ella y murciélagos que cruzan la cabecera de vez en
// cuando. Deja de mostrarse a partir del 2 de noviembre.
// Se puede tirar de las arañas (ratón o dedo), sin límite de distancia: el
// hilo se estira y, al soltarlas, vuelven rebotando como un muelle. Por eso
// cada araña y su hilo van en una capa por encima de toda la pantalla (si no,
// el panel del dashboard la recortaría al sacarla de él), enganchada a la
// telaraña. Colgando quietas se recortan como si siguieran dentro del panel.
// 30/10/2026: la telaraña se pega a la esquina de verdad del panel con scroll
// (el dashboard tiene padding y ancho máximo, así que con -top/-right fijos
// quedaba suelta y desplazada en pantallas anchas).
const HALLOWEEN_END = new Date(2026, 10, 2); // 2 nov 2026, 00:00 (hora local)

export function isHalloweenActive(now = new Date()): boolean {
  return now < HALLOWEEN_END;
}

const TELA = { ancho: 170, alto: 160 };
// Dónde se engancha cada araña en la telaraña, largo del hilo en reposo (px),
// tamaño y desfase de su balanceo para que no se muevan a la vez
const ARANAS = [
  { x: 58, y: 0, largo: 150, escala: 1, retraso: 0 },
  { x: 118, y: 72, largo: 85, escala: 0.7, retraso: -2.3 },
];
// Muelle: rigidez y amortiguación (por fotograma a 60 fps)
const RIGIDEZ = 0.06;
const AMORTIGUACION = 0.88;

type Punto = { x: number; y: number };

/** Contenedor que recorta al dashboard (el primero con scroll u overflow oculto). */
function contenedorQueRecorta(el: Element | null): Element | null {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n);
    if (/(auto|scroll|hidden|clip)/.test(o.overflow + o.overflowX + o.overflowY)) return n;
  }
  return null;
}

export function HalloweenDecor() {
  const capa = useRef<HTMLDivElement>(null);
  // Posición de la telaraña dentro del dashboard, su esquina en pantalla y el
  // recorte del panel
  const [geo, setGeo] = useState<{ pos: { top: number; right: number } | null; origen: Punto; recorte: string } | null>(null);

  // Sigue a la esquina del panel al hacer scroll, cambiar el tamaño o plegar la barra lateral
  useLayoutEffect(() => {
    if (!isHalloweenActive()) return;
    let pendiente = 0;
    const medir = () => {
      pendiente = 0;
      const el = capa.current;
      if (!el) return;
      const c = contenedorQueRecorta(el);
      const raiz = (el.offsetParent as Element | null)?.getBoundingClientRect();
      let pos: { top: number; right: number } | null = null;
      let origen: Punto;
      let recorte = "none";
      if (c && raiz) {
        const rc = c.getBoundingClientRect();
        // Borde derecho sin la barra de scroll y arriba del todo del contenido
        const derecha = rc.left + c.clientLeft + c.clientWidth;
        const arriba = rc.top + c.clientTop - c.scrollTop;
        pos = { top: Math.round(arriba - raiz.top), right: Math.round(raiz.right - derecha) };
        origen = { x: derecha - TELA.ancho, y: arriba };
        recorte = `inset(${Math.max(0, rc.top)}px ${Math.max(0, window.innerWidth - rc.right)}px ${Math.max(0, window.innerHeight - rc.bottom)}px ${Math.max(0, rc.left)}px)`;
      } else {
        const r = el.getBoundingClientRect();
        origen = { x: r.left, y: r.top };
      }
      setGeo((g) => {
        const igual = g && g.recorte === recorte
          && Math.abs(g.origen.x - origen.x) < 0.5 && Math.abs(g.origen.y - origen.y) < 0.5
          && g.pos?.top === pos?.top && g.pos?.right === pos?.right;
        return igual ? g : { pos, origen, recorte };
      });
    };
    const programar = () => { if (!pendiente) pendiente = requestAnimationFrame(medir); };
    medir();
    window.addEventListener("scroll", programar, true);
    window.addEventListener("resize", programar);
    const ro = new ResizeObserver(programar);
    ro.observe(document.body);
    const c = contenedorQueRecorta(capa.current);
    if (c) ro.observe(c);
    return () => {
      window.removeEventListener("scroll", programar, true);
      window.removeEventListener("resize", programar);
      ro.disconnect();
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, []);

  if (!isHalloweenActive()) return null;

  return (
    <>
      <style>{`
        @keyframes vantia-spider-drop {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(26px); }
        }
        @keyframes vantia-spider-sway {
          0%, 100% { transform: rotate(-3deg); }
          50%      { transform: rotate(3deg); }
        }
        .vantia-spider-sway { animation: vantia-spider-sway 5s ease-in-out infinite; }
        .vantia-spider-drop { animation: vantia-spider-drop 4s ease-in-out infinite; }
        .vantia-spider { cursor: grab; touch-action: none; }
        .vantia-spider:active { cursor: grabbing; }

        /* Murciélagos: cruzan de derecha a izquierda y descansan hasta la siguiente pasada */
        @keyframes vantia-bat-fly {
          0%        { transform: translateX(0); }
          45%, 100% { transform: translateX(calc(-100vw - 160px)); }
        }
        @keyframes vantia-bat-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(14px); }
        }
        @keyframes vantia-bat-flap {
          from { transform: scaleY(1); }
          to   { transform: scaleY(-0.45); }
        }
        .vantia-bat-fly { animation: vantia-bat-fly 22s linear infinite; }
        .vantia-bat-bob { animation: vantia-bat-bob 1.6s ease-in-out infinite; }
        .vantia-bat-flap { animation: vantia-bat-flap 0.18s ease-in-out infinite alternate; }

        @media (prefers-reduced-motion: reduce) {
          .vantia-spider-sway, .vantia-spider-drop { animation: none; }
          .vantia-bats { display: none; }
        }
      `}</style>

      <Murcielagos />

      <div
        ref={capa}
        aria-hidden="true"
        style={{ marginTop: 0, ...(geo?.pos ? { top: geo.pos.top, right: geo.pos.right } : {}) }}
        className={`pointer-events-none absolute z-10 select-none text-slate-400/70 ${geo?.pos ? "" : "-top-4 -right-4 md:-top-8 md:-right-8"}`}
      >
        <svg width={TELA.ancho} height={TELA.alto} viewBox={`0 0 ${TELA.ancho} ${TELA.alto}`} fill="none" stroke="currentColor" strokeLinecap="round">
          {/* Telaraña anclada en la esquina superior derecha */}
          <g strokeWidth="1">
            {/* Radios */}
            <path d="M170 0 L20 0" />
            <path d="M170 0 L40 60" />
            <path d="M170 0 L90 110" />
            <path d="M170 0 L140 140" />
            <path d="M170 0 L170 150" />
            {/* Anillos */}
            {[0.25, 0.45, 0.65, 0.85].map((t, i) => {
              const p = (x: number, y: number) => [170 + (x - 170) * t, y * t];
              const pts = [[20, 0], [40, 60], [90, 110], [140, 140], [170, 150]].map(([x, y]) => p(x, y));
              const d = pts
                .map(([x, y], j) => {
                  if (j === 0) return `M${x} ${y}`;
                  const [px, py] = pts[j - 1];
                  // Curva ligeramente hundida hacia la esquina, como un hilo con peso
                  const cx = (px + x) / 2 + (170 - (px + x) / 2) * 0.12;
                  const cy = (py + y) / 2 - ((py + y) / 2) * 0.12;
                  return `Q${cx} ${cy} ${x} ${y}`;
                })
                .join(" ");
              return <path key={i} d={d} strokeWidth={i === 3 ? 1.1 : 0.9} />;
            })}
          </g>
        </svg>
      </div>

      {geo && ARANAS.map((a, i) => (
        <Arana
          key={i}
          ancla={{ x: geo.origen.x + a.x, y: geo.origen.y + a.y }}
          largo={a.largo}
          escala={a.escala}
          retraso={a.retraso}
          recorte={geo.recorte}
        />
      ))}
    </>
  );
}

function Arana({ ancla, largo, escala, retraso, recorte }: {
  ancla: Punto; largo: number; escala: number; retraso: number; recorte: string;
}) {
  // Desplazamiento de la araña respecto al reposo
  const [desp, setDesp] = useState<Punto>({ x: 0, y: 0 });
  const [agarrada, setAgarrada] = useState(false);
  const [rebotando, setRebotando] = useState(false);
  const inicio = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const vel = useRef<Punto>({ x: 0, y: 0 });
  const ultimo = useRef({ x: 0, y: 0, t: 0 });
  const raf = useRef<number | null>(null);
  const grupoBajada = useRef<SVGGElement>(null);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const soltarConMuelle = (desde: Punto) => {
    let pos = { ...desde };
    setRebotando(true);
    const paso = () => {
      vel.current = {
        x: (vel.current.x - pos.x * RIGIDEZ) * AMORTIGUACION,
        y: (vel.current.y - pos.y * RIGIDEZ) * AMORTIGUACION,
      };
      pos = { x: pos.x + vel.current.x, y: pos.y + vel.current.y };
      const quieta = Math.abs(pos.x) < 0.3 && Math.abs(pos.y) < 0.3 && Math.abs(vel.current.x) < 0.3 && Math.abs(vel.current.y) < 0.3;
      if (quieta) {
        setDesp({ x: 0, y: 0 });
        setRebotando(false);
        raf.current = null;
        return;
      }
      setDesp(pos);
      raf.current = requestAnimationFrame(paso);
    };
    raf.current = requestAnimationFrame(paso);
  };

  const onPointerDown = (e: React.PointerEvent<SVGGElement>) => {
    e.preventDefault();
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    e.currentTarget.setPointerCapture(e.pointerId);
    // Se parte de donde está ahora en su subir y bajar, para que no dé un salto
    let bajada = 0;
    if (!rebotando && grupoBajada.current) {
      try { bajada = new DOMMatrixReadOnly(getComputedStyle(grupoBajada.current).transform).f; } catch { /* sin transform */ }
    }
    const desde = { x: desp.x, y: desp.y + bajada };
    setDesp(desde);
    inicio.current = { px: e.clientX, py: e.clientY, x: desde.x, y: desde.y };
    vel.current = { x: 0, y: 0 };
    ultimo.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setAgarrada(true);
    setRebotando(false);
  };

  const onPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!inicio.current) return;
    const nuevo = {
      x: inicio.current.x + e.clientX - inicio.current.px,
      y: inicio.current.y + e.clientY - inicio.current.py,
    };
    // Velocidad con la que se suelta (px por fotograma), para que salga lanzada
    const ahora = performance.now();
    const dt = Math.max(1, ahora - ultimo.current.t) / 16.7;
    vel.current = { x: (e.clientX - ultimo.current.x) / dt, y: (e.clientY - ultimo.current.y) / dt };
    ultimo.current = { x: e.clientX, y: e.clientY, t: ahora };
    setDesp(nuevo);
  };

  const onPointerUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!inicio.current) return;
    inicio.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
    setAgarrada(false);
    soltarConMuelle(desp);
  };

  // Mientras se tira de ella o rebota, sin el balanceo automático
  const enMovimiento = agarrada || rebotando;
  const a = ancla;
  const arana = { x: a.x + desp.x, y: a.y + largo + desp.y };
  // La araña se inclina hacia donde tira el hilo
  const giro = (Math.atan2(arana.x - a.x, arana.y - a.y) * -180) / Math.PI;
  const animacion = { animationDelay: `${retraso}s` };

  return createPortal(
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[45] select-none text-slate-400/70"
      width="100%" height="100%" fill="none" stroke="currentColor" strokeLinecap="round"
      // Quieta, se recorta como si siguiera dentro del panel; al tirar, por toda la pantalla
      style={{ clipPath: enMovimiento ? "none" : recorte }}
    >
      <g className={enMovimiento ? undefined : "vantia-spider-sway"} style={{ ...animacion, transformOrigin: `${a.x}px ${a.y}px` }}>
        <g ref={grupoBajada} className={enMovimiento ? undefined : "vantia-spider-drop"} style={animacion}>
          <line x1={a.x} y1={a.y} x2={arana.x} y2={arana.y - 10 * escala} strokeWidth="0.8" />
          <g
            transform={`translate(${arana.x} ${arana.y}) rotate(${enMovimiento ? giro : 0}) scale(${escala})`}
            className="vantia-spider text-slate-800"
            stroke="currentColor"
            fill="currentColor"
            style={{ pointerEvents: "auto" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* Zona para agarrarla más fácil que el propio dibujo */}
            <circle cx="0" cy="2" r="24" fill="transparent" stroke="none" />
            {/* Patas */}
            <g strokeWidth="1.6" fill="none">
              <path d="M-5 -2 Q-14 -12 -20 -6" />
              <path d="M-5 1 Q-16 -3 -22 4" />
              <path d="M-5 4 Q-15 6 -20 14" />
              <path d="M-4 6 Q-11 12 -14 20" />
              <path d="M5 -2 Q14 -12 20 -6" />
              <path d="M5 1 Q16 -3 22 4" />
              <path d="M5 4 Q15 6 20 14" />
              <path d="M4 6 Q11 12 14 20" />
            </g>
            {/* Cuerpo */}
            <ellipse cx="0" cy="4" rx="7" ry="8.5" stroke="none" />
            <circle cx="0" cy="-6" r="4.5" stroke="none" />
            {/* Ojos */}
            <circle cx="-1.7" cy="-6.5" r="1.1" fill="#ef4444" stroke="none" />
            <circle cx="1.7" cy="-6.5" r="1.1" fill="#ef4444" stroke="none" />
          </g>
        </g>
      </g>
    </svg>,
    document.body,
  );
}

// Tres murciélagos que cruzan la parte de arriba del dashboard en bandada.
const MURCIELAGOS = [
  { top: 18, izquierda: 0, tam: 34, aleteo: 0 },
  { top: 52, izquierda: 46, tam: 24, aleteo: -0.07 },
  { top: 8, izquierda: 84, tam: 20, aleteo: -0.12 },
];

function Murcielagos() {
  return (
    <div
      aria-hidden="true"
      style={{ marginTop: 0 }}
      className="vantia-bats pointer-events-none absolute inset-x-0 top-0 z-10 h-32 select-none overflow-hidden"
    >
      {/* Empieza justo fuera por la derecha; la primera pasada, a los pocos segundos */}
      <div className="vantia-bat-fly absolute left-full top-0" style={{ animationDelay: "-17s" }}>
        {MURCIELAGOS.map((m, i) => (
          <div key={i} className="vantia-bat-bob absolute" style={{ top: m.top, left: m.izquierda, animationDelay: `${-i * 0.5}s` }}>
            <svg width={m.tam} height={m.tam * 0.6} viewBox="-20 -12 40 24" className="text-slate-800">
              <g className="vantia-bat-flap" style={{ animationDelay: `${m.aleteo}s` }} fill="currentColor">
                <path d="M-2 -1 C-6 -8 -12 -9 -19 -5 C-15 -4 -14 0 -15 3 C-12 1 -9 2 -7 5 C-5 2 -3 2 -1 4 Z" />
                <path d="M2 -1 C6 -8 12 -9 19 -5 C15 -4 14 0 15 3 C12 1 9 2 7 5 C5 2 3 2 1 4 Z" />
              </g>
              {/* Cuerpo, orejas y ojos */}
              <ellipse cx="0" cy="1" rx="3" ry="5" fill="currentColor" />
              <path d="M-2.6 -2.5 L-2 -6.5 L-0.6 -3.5 Z M2.6 -2.5 L2 -6.5 L0.6 -3.5 Z" fill="currentColor" />
              <circle cx="-1.1" cy="-1.5" r="0.6" fill="#f59e0b" />
              <circle cx="1.1" cy="-1.5" r="0.6" fill="#f59e0b" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

// Fondo con forma de calabaza para el botón del asistente IA durante Halloween.
export function PumpkinShape({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 56 56" className={`drop-shadow-lg ${className}`}>
      {/* Tallo */}
      <path d="M27 11 Q26 5 31 2 L33 4.5 Q30 7 30.5 11 Z" fill="#3f6212" />
      <path d="M31 6 Q37 4 39 8" stroke="#4d7c0f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* Gajos */}
      <ellipse cx="15" cy="32" rx="13" ry="19" fill="#c2410c" />
      <ellipse cx="41" cy="32" rx="13" ry="19" fill="#c2410c" />
      <ellipse cx="21" cy="32" rx="11" ry="20" fill="#ea580c" />
      <ellipse cx="35" cy="32" rx="11" ry="20" fill="#ea580c" />
      <ellipse cx="28" cy="32" rx="10" ry="21" fill="#f97316" />
      {/* Brillo */}
      <ellipse cx="22" cy="21" rx="3" ry="6" fill="#fff" opacity="0.18" />
    </svg>
  );
}
