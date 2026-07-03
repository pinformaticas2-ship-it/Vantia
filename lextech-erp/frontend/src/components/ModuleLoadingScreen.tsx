import React from 'react';
import type { LucideIcon } from 'lucide-react';

const STYLES = `
  @keyframes mls-spin    { to { transform:rotate(360deg) } }
  @keyframes mls-loadbar { 0%{width:6%} 35%{width:55%} 65%{width:78%} 100%{width:93%} }
  @keyframes mls-enter   { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
  .mls-spin    { animation: mls-spin 0.9s linear infinite }
  .mls-loadbar { animation: mls-loadbar 2.5s ease-out forwards }
  .mls-enter   { animation: mls-enter .22s cubic-bezier(.22,1,.36,1) both }
`;

interface Props {
  name: string;
  desc?: string;
  Icon: LucideIcon;
  visible: boolean;
}

export function ModuleLoadingScreen({ name, desc, Icon, visible }: Props) {
  return (
    <>
      <style>{STYLES}</style>
      <div
        className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white mls-enter"
        style={{
          opacity:        visible ? 1 : 0,
          pointerEvents:  visible ? 'all' : 'none',
          transition:     'opacity 280ms ease',
        }}
      >
        <div className="flex flex-col items-center gap-6">
          {/* Ring + icon */}
          <div className="relative flex items-center justify-center">
            <div className="absolute h-24 w-24 rounded-full border-4 border-red-100" />
            <div className="absolute h-24 w-24 rounded-full border-4 border-transparent border-t-red-600 mls-spin" />
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-xl shadow-red-200">
              <Icon className="h-8 w-8 text-white" strokeWidth={1.6} />
            </div>
          </div>

          {/* Text */}
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-800">{name}</p>
            {desc && <p className="text-sm text-slate-400 mt-0.5">{desc}</p>}
          </div>

          {/* Progress bar */}
          <div className="w-48 h-[3px] bg-slate-100 rounded-full overflow-hidden">
            {visible && (
              <div className="h-full bg-gradient-to-r from-red-500 to-red-700 rounded-full mls-loadbar" />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
