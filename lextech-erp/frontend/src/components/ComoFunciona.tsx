import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';

/** Enlace "¿Cómo funciona?" a un capítulo del manual (Ajustes → Manual). */
export default function ComoFunciona({ capitulo, className = '' }: { capitulo: string; className?: string }) {
  return (
    <Link to={`/dashboard/config?section=manual&capitulo=${capitulo}`} title="Abrir el manual en este capítulo"
      className={`inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 ${className}`}>
      <HelpCircle size={13} /> ¿Cómo funciona?
    </Link>
  );
}
