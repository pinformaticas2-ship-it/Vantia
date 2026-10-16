// Decoración temporal de Halloween para el dashboard: telaraña en la esquina
// y una araña colgando de su hilo. Deja de mostrarse a partir del 2 de noviembre.
const HALLOWEEN_END = new Date(2026, 10, 2); // 2 nov 2026, 00:00 (hora local)

export function isHalloweenActive(now = new Date()): boolean {
  return now < HALLOWEEN_END;
}

export function HalloweenDecor() {
  if (!isHalloweenActive()) return null;

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
        @media (prefers-reduced-motion: reduce) {
          .vantia-spider-sway, .vantia-spider-drop { animation: none; }
        }
      `}</style>

      <svg width="170" height="230" viewBox="0 0 170 230" fill="none" stroke="currentColor" strokeLinecap="round">
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

        {/* Araña colgando */}
        <g className="vantia-spider-sway">
          <g className="vantia-spider-drop">
            <line x1="70" y1="-40" x2="70" y2="150" strokeWidth="0.8" />
            <g transform="translate(70 160)" className="text-slate-800" stroke="currentColor" fill="currentColor">
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
