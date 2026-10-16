import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Decoración temporal de Halloween para el dashboard: telaraña en la esquina
// y una araña colgando de su hilo. Deja de mostrarse a partir del 2 de noviembre.
// 16/10/2026: se puede tirar de la araña (ratón o dedo), sin límite de
// distancia: el hilo se estira y, al soltarla, vuelve rebotando como un muelle.
// Por eso la araña y su hilo van en una capa por encima de toda la pantalla
// (si no, el panel del dashboard la recortaría al sacarla de él), enganchada
// a la telaraña. Colgando quieta se recorta como si siguiera dentro del panel.
const HALLOWEEN_END = new Date(2026, 10, 2); // 2 nov 2026, 00:00 (hora local)

export function isHalloweenActive(now = new Date()): boolean {
  return now < HALLOWEEN_END;
}

// Punto de la telaraña del que cuelga el hilo y largo del hilo en reposo (px)
const ANCLA_EN_TELA = { x: 70, y: 0 };
const LARGO_HILO = 160;
// Muelle: rigidez y amortiguación (por fotograma a 60 fps)
const RIGIDEZ = 0.06;
const AMORTIGUACION = 0.88;

/** Contenedor que recorta al dashboard (el primero con scroll u overflow oculto). */
function contenedorQueRecorta(el: Element | null): Element | null {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n);
    if (/(auto|scroll|hidden|clip)/.test(o.overflow + o.overflowX + o.overflowY)) return n;
  }
  return null;
}

export function HalloweenDecor() {
  // Desplazamiento de la araña respecto al reposo
  const [desp, setDesp] = useState({ x: 0, y: 0 });
  const [agarrada, setAgarrada] = useState(false);
  const [rebotando, setRebotando] = useState(false);
  const inicio = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const vel = useRef({ x: 0, y: 0 });
  const ultimo = useRef({ x: 0, y: 0, t: 0 });
  const raf = useRef<number | null>(null);
  const grupoBajada = useRef<SVGGElement>(null);
  const tela = useRef<SVGSVGElement>(null);
  // Dónde está, en pantalla, el punto del que cuelga, y el recorte del panel
  const [ancla, setAncla] = useState<{ x: number; y: number } | null>(null);
  const [recorte, setRecorte] = useState("none");

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  // Sigue a la telaraña al hacer scroll, cambiar el tamaño o plegar la barra lateral
  useLayoutEffect(() => {
    if (!isHalloweenActive()) return;
    let pendiente = 0;
    const medir = () => {
      pendiente = 0;
      const r = tela.current?.getBoundingClientRect();
      if (!r) return;
      const n = { x: r.left + ANCLA_EN_TELA.x, y: r.top + ANCLA_EN_TELA.y };
      setAncla((a) => (a && Math.abs(a.x - n.x) < 0.5 && Math.abs(a.y - n.y) < 0.5 ? a : n));
      const c = contenedorQueRecorta(tela.current)?.getBoundingClientRect();
      setRecorte(c
        ? `inset(${Math.max(0, c.top)}px ${Math.max(0, window.innerWidth - c.right)}px ${Math.max(0, window.innerHeight - c.bottom)}px ${Math.max(0, c.left)}px)`
        : "none");
    };
    const programar = () => { if (!pendiente) pendiente = requestAnimationFrame(medir); };
    medir();
    window.addEventListener("scroll", programar, true);
    window.addEventListener("resize", programar);
    const ro = new ResizeObserver(programar);
    ro.observe(document.body);
    const c = contenedorQueRecorta(tela.current);
    if (c) ro.observe(c);
    return () => {
      window.removeEventListener("scroll", programar, true);
      window.removeEventListener("resize", programar);
      ro.disconnect();
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, []);

  if (!isHalloweenActive()) return null;

  const soltarConMuelle = (desde: { x: number; y: number }) => {
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
  const a = ancla || { x: 0, y: 0 };
  const arana = { x: a.x + desp.x, y: a.y + LARGO_HILO + desp.y };
  // La araña se inclina hacia donde tira el hilo
  const giro = (Math.atan2(arana.x - a.x, arana.y - a.y) * -180) / Math.PI;

  const capaArana = ancla && createPortal(
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[45] select-none text-slate-400/70"
      width="100%" height="100%" fill="none" stroke="currentColor" strokeLinecap="round"
      // Quieta, se recorta como si siguiera dentro del panel; al tirar, por toda la pantalla
      style={{ clipPath: enMovimiento ? "none" : recorte }}
    >
      <g className={enMovimiento ? undefined : "vantia-spider-sway"} style={{ transformOrigin: `${a.x}px ${a.y}px` }}>
        <g ref={grupoBajada} className={enMovimiento ? undefined : "vantia-spider-drop"}>
          <line x1={a.x} y1={a.y} x2={arana.x} y2={arana.y - 10} strokeWidth="0.8" />
          <g
            transform={`translate(${arana.x} ${arana.y}) rotate(${enMovimiento ? giro : 0})`}
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

  return (
    <div
      aria-hidden="true"
      style={{ marginTop: 0 }}
      className="pointer-events-none absolute -top-6 -right-6 z-10 select-none text-slate-400/70"
    >
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
        @media (prefers-reduced-motion: reduce) {
          .vantia-spider-sway, .vantia-spider-drop { animation: none; }
        }
      `}</style>

      <svg ref={tela} width="170" height="230" viewBox="0 0 170 230" fill="none" stroke="currentColor" strokeLinecap="round">
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
      {capaArana}
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
