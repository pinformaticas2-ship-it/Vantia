import { useEffect, useRef, useState } from "react";

// Decoración temporal de Halloween para el dashboard: telaraña en la esquina
// y una araña colgando de su hilo. Deja de mostrarse a partir del 2 de noviembre.
// 16/10/2026: se puede tirar de la araña (ratón o dedo): el hilo se estira y,
// al soltarla, vuelve rebotando como un muelle.
const HALLOWEEN_END = new Date(2026, 10, 2); // 2 nov 2026, 00:00 (hora local)

export function isHalloweenActive(now = new Date()): boolean {
  return now < HALLOWEEN_END;
}

// Punto donde cuelga el hilo y posición de la araña en reposo (unidades del SVG = px)
const ANCLA = { x: 70, y: -40 };
const REPOSO = { x: 70, y: 160 };
// Hasta dónde se puede estirar (respecto al reposo)
const LIMITE = { izq: -140, der: 80, arriba: -110, abajo: 320 };
// Muelle: rigidez y amortiguación (por fotograma a 60 fps)
const RIGIDEZ = 0.06;
const AMORTIGUACION = 0.88;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

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

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

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
      x: limitar(inicio.current.x + e.clientX - inicio.current.px, LIMITE.izq, LIMITE.der),
      y: limitar(inicio.current.y + e.clientY - inicio.current.py, LIMITE.arriba, LIMITE.abajo),
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
  const arana = { x: REPOSO.x + desp.x, y: REPOSO.y + desp.y };
  // La araña se inclina hacia donde tira el hilo
  const giro = (Math.atan2(arana.x - ANCLA.x, arana.y - ANCLA.y) * -180) / Math.PI;

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
        .vantia-spider-sway { transform-origin: 70px 0; animation: vantia-spider-sway 5s ease-in-out infinite; }
        .vantia-spider-drop { animation: vantia-spider-drop 4s ease-in-out infinite; }
        .vantia-spider { cursor: grab; touch-action: none; }
        .vantia-spider:active { cursor: grabbing; }
        @media (prefers-reduced-motion: reduce) {
          .vantia-spider-sway, .vantia-spider-drop { animation: none; }
        }
      `}</style>

      <svg width="170" height="230" viewBox="0 0 170 230" fill="none" stroke="currentColor" strokeLinecap="round" style={{ overflow: "visible" }}>
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

        {/* Araña colgando: se puede agarrar y estirar del hilo */}
        <g className={enMovimiento ? undefined : "vantia-spider-sway"}>
          <g ref={grupoBajada} className={enMovimiento ? undefined : "vantia-spider-drop"}>
            <line x1={ANCLA.x} y1={ANCLA.y} x2={arana.x} y2={arana.y - 10} strokeWidth="0.8" />
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
      </svg>
    </div>
  );
}
