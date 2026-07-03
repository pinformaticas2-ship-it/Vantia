const DELAYS = ['0s', '0.16s', '0.32s', '0.16s', '0s'];

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  muted?: boolean;
  label?: string;
  className?: string;
}

const sizeConfig = {
  sm: { barH: 20, barW: 3, gap: '3px' },
  md: { barH: 30, barW: 4, gap: '4px' },
  lg: { barH: 42, barW: 5, gap: '6px' },
  xl: { barH: 58, barW: 6, gap: '7px' },
};

export function Spinner({ size = 'md', muted = false, label, className = '' }: SpinnerProps) {
  const { barH, barW, gap } = sizeConfig[size];
  const color = muted ? 'rgba(148,163,184,0.75)' : 'var(--accent-from)';

  return (
    <div className={`flex flex-col items-center gap-2.5 ${className}`}>
      <div className="flex items-end" style={{ gap }}>
        {DELAYS.map((delay, i) => (
          <span
            key={i}
            className="spinner-bar rounded-full"
            style={{ height: barH, width: barW, backgroundColor: color, animationDelay: delay }}
          />
        ))}
      </div>
      {label && (
        <p className="text-xs font-medium text-slate-400 animate-pulse tracking-wide">{label}</p>
      )}
    </div>
  );
}
