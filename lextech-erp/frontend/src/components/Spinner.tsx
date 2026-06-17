const DELAYS = ['0s', '0.16s', '0.32s', '0.16s', '0s'];

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
  label?: string;
  className?: string;
}

const sizeConfig = {
  sm: { barH: 16, barW: 3, gap: '3px' },
  md: { barH: 24, barW: 3, gap: '4px' },
  lg: { barH: 32, barW: 4, gap: '5px' },
};

export function Spinner({ size = 'md', muted = false, label, className = '' }: SpinnerProps) {
  const { barH, barW, gap } = sizeConfig[size];
  const color = muted ? 'rgba(148,163,184,0.75)' : '#ab0433';

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
