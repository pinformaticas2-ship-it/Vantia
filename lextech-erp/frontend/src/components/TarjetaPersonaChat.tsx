import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { Briefcase, Copy, Loader2, MessageSquare, Phone, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { aviso } from '../lib/avisos';
import { t } from '../lib/i18n';

// Tarjeta de una persona del despacho en el chat (16/11/2026): al tocar su
// nombre o su foto. Enseña el cargo y el teléfono que puso en Ajustes → Mi
// perfil, y lleva a un mensaje directo.

const EVENTO = 'vantia:perfil-chat';
export interface PersonaChat { userId: string; nombre: string; avatar?: string | null }
export function abrirPerfilChat(p: PersonaChat) { window.dispatchEvent(new CustomEvent<PersonaChat>(EVENTO, { detail: p })); }

const ROLES: Record<string, string> = { propietario: 'Propietario', admin: 'Administrador', miembro: 'Miembro', soporte: 'Soporte técnico' };

export function TarjetaPersonaChat({ currentUserId, onDM }: { currentUserId: string | null | undefined; onDM: (p: PersonaChat) => void }) {
  const { getToken } = useAuth();
  const [persona, setPersona] = useState<PersonaChat | null>(null);
  const [datos, setDatos] = useState<{ nombre?: string; cargo: string; telefono: string; rol: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const abrir = (e: Event) => setPersona((e as CustomEvent<PersonaChat>).detail);
    window.addEventListener(EVENTO, abrir);
    return () => window.removeEventListener(EVENTO, abrir);
  }, []);
  useEffect(() => {
    if (!persona) return;
    setDatos(null); setCargando(true);
    apiFetch(`/api/chat/perfil/${encodeURIComponent(persona.userId)}`, { getToken })
      .then((r) => setDatos(r?.success ? r.data : null))
      .catch(() => setDatos(null))
      .finally(() => setCargando(false));
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPersona(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [persona, getToken]);

  if (!persona) return null;
  const yo = persona.userId === currentUserId;
  const nombre = datos?.nombre || persona.nombre;
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-900/30 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setPersona(null); }}>
      <div className="w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-sm sm:rounded-2xl">
        <div className="flex items-start gap-3">
          {persona.avatar
            ? <img src={persona.avatar} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
            : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-lg font-bold text-red-600">{iniciales || '?'}</div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-slate-800" data-sin-traducir>{nombre}</p>
            <p className="text-xs text-slate-500">{datos?.rol ? t(ROLES[datos.rol] || datos.rol) : ' '}{yo ? ` · ${t('Tú')}` : ''}</p>
          </div>
          <button type="button" onClick={() => setPersona(null)} aria-label={t('Cerrar')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="mt-4 space-y-2">
          {cargando ? (
            <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" />{t('Cargando…')}</p>
          ) : (
            <>
              <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                <Briefcase size={15} className="shrink-0 text-slate-400" />
                <span className={datos?.cargo ? 'text-slate-800' : 'text-slate-400'} data-sin-traducir={datos?.cargo ? true : undefined}>{datos?.cargo || t('Sin cargo')}</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                <Phone size={15} className="shrink-0 text-slate-400" />
                {datos?.telefono ? (
                  <>
                    <a href={`tel:${datos.telefono.replace(/[^\d+]/g, '')}`} className="min-w-0 flex-1 truncate font-semibold text-red-600 hover:underline" data-sin-traducir>{datos.telefono}</a>
                    <button type="button" title={t('Copiar')} onClick={() => { void navigator.clipboard?.writeText(datos.telefono); aviso.ok(t('Teléfono copiado.')); }}
                      className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><Copy size={13} /></button>
                  </>
                ) : <span className="text-slate-400">{t('Sin teléfono')}</span>}
              </div>
              {yo && (!datos?.cargo || !datos?.telefono) && <p className="text-[11px] text-slate-400">{t('Puedes poner tu cargo y tu teléfono en Ajustes → Mi perfil.')}</p>}
            </>
          )}
        </div>

        {!yo && (
          <button type="button" onClick={() => { onDM(persona); setPersona(null); }}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">
            <MessageSquare size={15} />{t('Mensaje directo')}</button>
        )}
      </div>
    </div>,
    document.body,
  );
}
