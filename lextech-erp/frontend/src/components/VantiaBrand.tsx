type VantiaBrandProps = {
  size?: number;
  showWordmark?: boolean;
  theme?: "light" | "dark";
  subtitle?: string;
  className?: string;
};

function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className="shrink-0"
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id="goldRingBrand" x1="14" y1="10" x2="50" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d7c08a" />
          <stop offset="1" stopColor="#b3924a" />
        </linearGradient>
        <linearGradient id="navyBrand" x1="21" y1="18" x2="42" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#304763" />
          <stop offset="1" stopColor="#1e2f45" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="16" fill="#f5f1e8" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="url(#goldRingBrand)" strokeWidth="3.5" />
      <path
        d="M24 22 32 43 40 22"
        fill="none"
        stroke="url(#navyBrand)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.5"
      />
      <path
        d="M20 22h8m16 0h-8"
        fill="none"
        stroke="url(#navyBrand)"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <path d="M20 22 16.5 30.5h7L20 22Zm24 0-3.5 8.5h7L44 22Z" fill="url(#navyBrand)" />
      <circle cx="32" cy="49" r="3.5" fill="url(#navyBrand)" />
    </svg>
  );
}

export default function VantiaBrand({
  size = 44,
  showWordmark = true,
  theme = "light",
  subtitle,
  className = "",
}: VantiaBrandProps) {
  const isDark = theme === "dark";
  const titleClass = isDark ? "text-white" : "text-slate-900";
  const accentClass = isDark ? "text-[#e7d4a8]" : "text-[#8b6a2b]";
  const subtitleClass = isDark ? "text-slate-200" : "text-slate-700";

  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <BrandMark size={size} />
      {showWordmark && (
        <div className="min-w-0">
          <p className={`text-xl font-black tracking-tight leading-none ${titleClass}`}>
            vant<span className={accentClass}>IA</span>
          </p>
          {subtitle && (
            <p className={`text-[11px] font-medium mt-1 leading-none ${subtitleClass}`}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
