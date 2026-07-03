import React, { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';

const STYLES = `
  @keyframes mls-spin    { to { transform:rotate(360deg) } }
  @keyframes mls-loadbar { 0%{width:6%} 35%{width:55%} 65%{width:78%} 100%{width:93%} }
  .mls-spin    { animation: mls-spin 0.9s linear infinite }
  .mls-loadbar { animation: mls-loadbar 2.4s ease-out forwards }
`;

interface Props {
  name: string;
  desc?: string;
  Icon: LucideIcon;
  exiting?: boolean;
}

export function ModuleLoadingScreen({ name, desc, Icon, exiting = false }: Props) {
  // Start invisible, transition to visible on next frame (triggers enter CSS transition)
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const show = visible && !exiting;

  return (
    <>
      <style>{STYLES}</style>
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white"
        style={{
          opacity:        show ? 1 : 0,
          transform:      show ? 'scale(1)' : exiting ? 'scale(1.03)' : 'scale(0.95)',
          transition:     'opacity 240ms ease, transform 240ms ease',
          pointerEvents:  exiting ? 'none' : 'auto',
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
            {!exiting && (
              <div className="h-full bg-gradient-to-r from-red-500 to-red-700 rounded-full mls-loadbar" />
            )}
          </div>

        </div>
      </div>
    </>
  );
}
