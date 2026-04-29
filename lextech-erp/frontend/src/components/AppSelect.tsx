import React, {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

interface OptionItem {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

function isPlaceholderOption(option: OptionItem) {
  return option.value === "" && /seleccionar/i.test(option.label);
}

interface AppSelectProps {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  variant?: "default" | "emerald";
  className?: string;
  children?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}

function parseOptions(children: React.ReactNode, group?: string): OptionItem[] {
  const items: OptionItem[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as React.ReactElement<any>;

    if (el.type === "option") {
      items.push({
        value: String(el.props.value ?? ""),
        label: String(el.props.children ?? el.props.value ?? ""),
        disabled: Boolean(el.props.disabled),
        group,
      });
      return;
    }

    if (el.type === "optgroup") {
      items.push(...parseOptions(el.props.children, String(el.props.label ?? "")));
    }
  });

  return items;
}

export default function AppSelect({
  value = "",
  onChange,
  variant = "default",
  className = "",
  children,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Buscar...",
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalId = useRef(`app-select-${Math.random().toString(36).slice(2)}`);
  const searchRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => parseOptions(children), [children]);
  const selected = options.find((option) => option.value === value);
  const hasEmptyOption = options.some((option) => option.value === "");
  const displayLabel = selected?.label ?? "-- Seleccionar --";
  const isEmpty = !value || selected?.disabled;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    const visibleOptions = options.filter((option) => !isPlaceholderOption(option));
    if (!normalizedQuery) return visibleOptions;
    return visibleOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery) ||
      (option.group || "").toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, options]);

  const accent = variant === "emerald"
    ? {
        check: "text-emerald-600",
        hover: "hover:bg-emerald-50 hover:text-emerald-800",
        active: "bg-emerald-50 text-emerald-700",
        chevron: "text-emerald-400",
        openBorder: "border-emerald-400 ring-2 ring-emerald-100",
        border: "focus:border-emerald-400 focus:ring-emerald-100",
        search: "focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100",
      }
    : {
        check: "text-red-600",
        hover: "hover:bg-red-50 hover:text-red-800",
        active: "bg-red-50 text-red-700",
        chevron: "text-red-400",
        openBorder: "border-red-400 ring-2 ring-red-100",
        border: "focus:border-red-400 focus:ring-red-100",
        search: "focus:border-red-300 focus:ring-2 focus:ring-red-100",
      };

  const openDropdown = useCallback(() => {
    if (disabled) return;
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setQuery("");
    setOpen(true);
  }, [disabled]);

  const closeDropdown = useCallback(() => setOpen(false), []);

  const select = (nextValue: string) => {
    onChange?.({ target: { value: nextValue } });
    closeDropdown();
  };

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const portal = document.getElementById(portalId.current);
      if (!triggerRef.current?.contains(target) && !portal?.contains(target)) {
        closeDropdown();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [closeDropdown, open]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !searchable || options.length <= 8) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, options.length, searchable]);

  const dropStyle: React.CSSProperties = useMemo(() => {
    if (!rect) return { display: "none" };

    const viewportPadding = 12;
    const desiredWidth = Math.max(rect.width, 220);
    const width = Math.min(desiredWidth, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding,
    );
    const estimatedHeight = searchable && options.length > 8 ? 320 : 260;
    const fitsBelow = rect.bottom + 10 + estimatedHeight <= window.innerHeight - viewportPadding;
    const top = fitsBelow
      ? rect.bottom + 8
      : Math.max(viewportPadding, rect.top - estimatedHeight - 8);

    return {
      position: "fixed",
      top,
      left,
      width,
      zIndex: 10000,
    };
  }, [options.length, rect, searchable]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={open ? closeDropdown : openDropdown}
        className={[
          "w-full flex items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-sm transition-all duration-150 focus:outline-none",
          disabled
            ? "cursor-default border-slate-100 bg-slate-50 text-slate-400"
            : open
              ? `${accent.openBorder} shadow-sm`
              : `border-slate-200 hover:border-slate-300 ${accent.border}`,
          className,
        ].join(" ")}
      >
        <span className={`truncate text-sm ${isEmpty ? "text-slate-400" : "text-slate-700"}`}>
          {displayLabel}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          className={`shrink-0 transition-transform duration-200 ${accent.chevron} ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && createPortal(
        <div
          id={portalId.current}
          style={dropStyle}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-16px_rgba(15,23,42,0.28)] ring-1 ring-slate-100 animate-fade-in"
        >
          {hasEmptyOption && value && (
            <div className="border-b border-slate-100 bg-slate-50/80 px-2 py-1.5">
              <button
                type="button"
                onClick={() => select("")}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-white hover:text-slate-700"
              >
                <span>Quitar selección</span>
                <span className="text-xs uppercase tracking-wide text-slate-400">Limpiar</span>
              </button>
            </div>
          )}

          {searchable && options.length > 8 && (
            <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-2">
              <label className="relative block">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={`w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 outline-none ${accent.search}`}
                />
              </label>
            </div>
          )}

          <ul className="max-h-56 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-slate-200">
            {filteredOptions.length === 0 && (
              <li className="px-3 py-3 text-sm text-slate-400">
                No hay resultados para esa busqueda.
              </li>
            )}

            {filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              const isPlaceholder = option.disabled;
              const previousGroup = index > 0 ? filteredOptions[index - 1]?.group : undefined;
              const showGroup = option.group && option.group !== previousGroup;

              return (
                <React.Fragment key={`${option.group || "base"}-${option.value}`}>
                  {showGroup && (
                    <li className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      {option.group}
                    </li>
                  )}

                  <li>
                    <button
                      type="button"
                      disabled={isPlaceholder}
                      onClick={() => !isPlaceholder && select(option.value)}
                      className={[
                        "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors duration-100",
                        isPlaceholder
                          ? "cursor-default italic text-slate-400"
                          : isSelected
                            ? `${accent.active} cursor-pointer font-semibold shadow-sm`
                            : `cursor-pointer text-slate-700 ${accent.hover}`,
                      ].join(" ")}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected && !isPlaceholder && (
                        <Check size={13} strokeWidth={2.5} className={`ml-2 shrink-0 ${accent.check}`} />
                      )}
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
