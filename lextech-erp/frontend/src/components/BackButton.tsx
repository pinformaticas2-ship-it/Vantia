import { ArrowLeft } from "lucide-react";

type BackButtonProps = {
  onClick?: () => void;
  label?: string;
  className?: string;
  variant?: "light" | "dark";
};

export default function BackButton({
  onClick,
  label = "Volver",
  className = "",
  variant = "light",
}: BackButtonProps) {
  const styles =
    variant === "dark"
      ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
      : "border-slate-200 bg-white text-slate-700 hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition-colors ${styles} ${className}`.trim()}
    >
      <ArrowLeft size={16} />
      {label}
    </button>
  );
}
