import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon, Archive, ChevronDown, ChevronRight, FileText, Folder, Inbox, Mail, Plus, Send, Star, Tag, Trash2,
  type LucideIcon,
} from 'lucide-react';
import { t } from '../lib/i18n';

// ── Correo · vista de árbol (27/11/2026) ─────────────────────────────────────
// Al estilo MN Program / Thunderbird: todos los buzones a la vez, cada uno con
// sus carpetas (subcarpetas incluidas) y los no leídos. Pulsar una carpeta de
// otro buzón cambia a ese buzón y abre esa carpeta. La vista se elige en la
// cinta del correo («Vista árbol» / «Vista actual»).

export interface CarpetaImap { path: string; name: string; specialUse?: string; delimiter?: string; noSelect?: boolean }
type ClaveSistema = 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE';

export interface CuentaArbol {
  tipo: 'imap' | 'gmail';
  /** IMAP: id de la cuenta. Gmail: id del perfil guardado. */
  id: string;
  email: string;
  /** Gmail sin sesión abierta en este navegador: al pulsarla hay que volver a conectarla. */
  sinSesion?: boolean;
}

const SISTEMA: { clave: ClaveSistema; label: string; icono: LucideIcon }[] = [
  { clave: 'INBOX',   label: 'Bandeja de entrada', icono: Inbox },
  { clave: 'DRAFTS',  label: 'Borradores',         icono: FileText },
  { clave: 'SENT',    label: 'Enviados',           icono: Send },
  { clave: 'SPAM',    label: 'Mensaje no deseado', icono: AlertOctagon },
  { clave: 'TRASH',   label: 'Papelera',           icono: Trash2 },
  { clave: 'ARCHIVE', label: 'Archivo@@correo',    icono: Archive },
];

/** Qué carpeta de un buzón IMAP es Enviados, Papelera… (mismo criterio que la vista actual). */
export function mapaCarpetasSistema(carpetas: CarpetaImap[]): Partial<Record<ClaveSistema, string>> {
  const sel = carpetas.filter((f) => !f.noSelect);
  const porUso = (u: string) => sel.find((f) => f.specialUse === u)?.path;
  const porNombre = (ps: RegExp[]) => sel.find(({ path }) => {
    const n = path.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return ps.some((p) => p.test(n));
  })?.path;
  return {
    INBOX: sel.find((f) => f.path.toUpperCase() === 'INBOX')?.path || 'INBOX',
    SENT: porUso('\\Sent') || porNombre([/^sent$/, /^sent items$/, /^enviados?$/, /sent/, /enviad/]),
    DRAFTS: porUso('\\Drafts') || porNombre([/^drafts?$/, /^borradores?$/, /draft/, /borrad/]),
    TRASH: porUso('\\Trash') || porNombre([/^trash$/, /^papelera$/, /^deleted(?: items)?$/, /trash/, /papelera/, /deleted/, /eliminad/]),
    SPAM: porUso('\\Junk') || porNombre([/^spam$/, /^junk$/, /^correo no deseado$/, /spam/, /junk/, /no deseado/]),
    ARCHIVE: porUso('\\Archive') || porNombre([/^archive$/, /^archivo$/, /^all mail$/, /archiv/]),
  };
}

interface Nodo { path: string; nombre: string; seleccionable: boolean; hijos: Nodo[] }

/** Árbol de carpetas a partir de las rutas («INBOX.GESTIONADO», «Clientes/2026»…). */
function construirArbol(carpetas: CarpetaImap[]): Nodo[] {
  const porRuta = new Map<string, Nodo>();
  const raiz: Nodo[] = [];
  const ordenadas = [...carpetas].sort((a, b) => a.path.localeCompare(b.path, 'es', { sensitivity: 'base' }));
  for (const f of ordenadas) {
    const d = f.delimiter || (f.path.includes('/') ? '/' : '.');
    const partes = f.path.split(d);
    let acumulada = '';
    let nivel = raiz;
    partes.forEach((p, i) => {
      acumulada = i === 0 ? p : `${acumulada}${d}${p}`;
      let n = porRuta.get(acumulada);
      if (!n) {
        n = { path: acumulada, nombre: p, seleccionable: false, hijos: [] };
        porRuta.set(acumulada, n);
        nivel.push(n);
      }
      if (i === partes.length - 1) { n.seleccionable = !f.noSelect; n.nombre = f.name || p; }
      nivel = n.hijos;
    });
  }
  return raiz;
}

function leerPlegados(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('vantia.correo.arbol.plegados') || '[]')); } catch { return new Set(); }
}

export default function CorreoArbol({
  cuentas, activa, carpetaSeleccionada, carpetasDe, noLeidos, etiquetasGmail, oscuro,
  onElegir, onRedactar,
}: {
  cuentas: CuentaArbol[];
  /** La cuenta que está abierta ahora. */
  activa: { tipo: 'imap' | 'gmail'; id: string } | null;
  carpetaSeleccionada: string;
  /** Carpetas de un buzón IMAP (se piden al desplegarlo; la de la cuenta activa ya está cargada). */
  carpetasDe: (cuentaId: string) => Promise<CarpetaImap[]>;
  /** No leídos por «idCuenta|carpeta». */
  noLeidos: Map<string, number>;
  /** Etiquetas propias de la cuenta Gmail abierta. */
  etiquetasGmail: { id: string; name: string; unread?: number }[];
  oscuro: boolean;
  onElegir: (cuenta: CuentaArbol, carpeta: string) => void;
  onRedactar: () => void;
}) {
  const [plegados, setPlegados] = useState<Set<string>>(leerPlegados);
  const [carpetas, setCarpetas] = useState<Record<string, CarpetaImap[] | 'cargando' | 'error'>>({});
  const alternar = (k: string) => setPlegados((p) => {
    const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem('vantia.correo.arbol.plegados', JSON.stringify([...n])); } catch { /* noop */ }
    return n;
  });

  // Carpetas de cada buzón IMAP desplegado (una vez por buzón).
  const imapIds = useMemo(() => cuentas.filter((c) => c.tipo === 'imap').map((c) => c.id), [cuentas]);
  useEffect(() => {
    for (const id of imapIds) {
      if (plegados.has(`cuenta:${id}`) || carpetas[id]) continue;
      setCarpetas((p) => ({ ...p, [id]: 'cargando' }));
      carpetasDe(id)
        .then((fs) => setCarpetas((p) => ({ ...p, [id]: fs })))
        .catch(() => setCarpetas((p) => ({ ...p, [id]: 'error' })));
    }
  }, [imapIds, plegados]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = (os: string, cl: string) => (oscuro ? os : cl);
  const fila = (activaFila: boolean) => `group flex w-full items-center gap-2 rounded-md py-[5px] pr-2 text-left text-[13px] transition-colors ${
    activaFila ? c('bg-red-600/25 text-white font-semibold', 'bg-red-50 text-red-700 font-semibold ring-1 ring-red-100') : c('text-slate-300 hover:bg-white/5', 'text-slate-700 hover:bg-slate-100')
  }`;
  const contador = (n: number | undefined, activaFila: boolean) => (n && n > 0
    ? <span className={`ml-auto min-w-[20px] rounded-full px-1.5 text-center text-[10px] font-bold leading-[18px] ${activaFila ? 'bg-red-600 text-white' : c('bg-white/15 text-slate-200', 'bg-slate-500 text-white')}`}>{n > 999 ? '999+' : n}</span>
    : null);
  const flecha = (abierta: boolean, onClick: () => void, visible = true) => (
    <span role="button" tabIndex={visible ? 0 : -1} onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(); } }}
      className={`flex h-5 w-4 shrink-0 items-center justify-center ${visible ? c('text-slate-500 hover:text-slate-200', 'text-slate-400 hover:text-slate-700') : 'invisible'}`}>
      {abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
    </span>
  );

  const renderCuenta = (cuenta: CuentaArbol) => {
    const kCuenta = `cuenta:${cuenta.id}`;
    const abierta = !plegados.has(kCuenta);
    const esActiva = activa?.tipo === cuenta.tipo && activa.id === cuenta.id;
    const unreadDe = (carpeta: string) => noLeidos.get(`${cuenta.id}|${carpeta}`) || 0;
    const totalCuenta = [...noLeidos.entries()].filter(([k]) => k.startsWith(`${cuenta.id}|`) && /\|inbox/i.test(k)).reduce((s, [, v]) => s + v, 0);

    let cuerpo: React.ReactNode = null;
    if (abierta) {
      if (cuenta.tipo === 'gmail') {
        const items: { clave: string; label: string; icono: LucideIcon; unread?: number }[] = [
          { clave: 'INBOX', label: 'Bandeja de entrada', icono: Inbox, unread: unreadDe('INBOX') },
          { clave: 'STARRED', label: 'Destacados', icono: Star },
          { clave: 'DRAFTS', label: 'Borradores', icono: FileText },
          { clave: 'SENT', label: 'Enviados', icono: Send },
          { clave: 'SPAM', label: 'Mensaje no deseado', icono: AlertOctagon },
          { clave: 'TRASH', label: 'Papelera', icono: Trash2 },
        ];
        cuerpo = (
          <>
            {items.map((it) => {
              const sel = esActiva && carpetaSeleccionada === it.clave;
              const Icono = it.icono;
              return (
                <button key={it.clave} type="button" onClick={() => onElegir(cuenta, it.clave)} className={fila(sel)} style={{ paddingLeft: 26 }}>
                  <Icono size={14} className="shrink-0 opacity-80" /><span className="truncate">{t(it.label)}</span>{contador(it.unread, sel)}
                </button>
              );
            })}
            {esActiva && etiquetasGmail.map((l) => {
              const sel = carpetaSeleccionada === l.id;
              return (
                <button key={l.id} type="button" onClick={() => onElegir(cuenta, l.id)} className={fila(sel)} style={{ paddingLeft: 26 }}>
                  <Tag size={14} className="shrink-0 opacity-80" /><span className="truncate">{l.name}</span>{contador(l.unread, sel)}
                </button>
              );
            })}
          </>
        );
      } else {
        const estado = carpetas[cuenta.id];
        if (estado === 'cargando' || !estado) cuerpo = <p className={`py-1 pl-7 text-[11px] ${c('text-slate-500', 'text-slate-400')}`}>{t("Cargando carpetas…")}</p>;
        else {
          const lista = estado === 'error' ? [] : estado;
          const mapa = mapaCarpetasSistema(lista);
          const rutaSistema = new Map<string, ClaveSistema>();
          for (const [k, v] of Object.entries(mapa)) if (v) rutaSistema.set(v, k as ClaveSistema);
          const arbol = construirArbol(lista.length ? lista : [{ path: 'INBOX', name: 'INBOX' }]);
          const subir = (nodos: Nodo[]) => {
            for (const n of nodos) {
              const quedan: Nodo[] = [];
              for (const h of n.hijos) {
                if (rutaSistema.has(h.path) && rutaSistema.get(h.path) !== 'INBOX') arbol.push(h); else quedan.push(h);
              }
              n.hijos = quedan;
              subir(n.hijos);
            }
          };
          subir([...arbol]);
          const claveDe = (path: string) => rutaSistema.get(path) || path;
          const orden = (n: Nodo) => { const k = rutaSistema.get(n.path); return k ? SISTEMA.findIndex((s) => s.clave === k) : 100; };
          arbol.sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

          const renderNodo = (n: Nodo, nivel: number): React.ReactNode => {
            const k = rutaSistema.get(n.path);
            const sis = k ? SISTEMA.find((s) => s.clave === k) : null;
            const Icono = sis?.icono || Folder;
            const clave = claveDe(n.path);
            const sel = esActiva && carpetaSeleccionada === clave;
            const kNodo = `carpeta:${cuenta.id}:${n.path}`;
            const abiertaN = n.hijos.length > 0 && !plegados.has(kNodo);
            return (
              <React.Fragment key={n.path}>
                <button type="button" title={n.path}
                  onClick={() => (n.seleccionable ? onElegir(cuenta, clave) : alternar(kNodo))}
                  className={fila(sel)} style={{ paddingLeft: 10 + nivel * 16 }}>
                  {flecha(abiertaN, () => alternar(kNodo), n.hijos.length > 0)}
                  <Icono size={14} className={`shrink-0 ${sis ? 'opacity-80' : c('text-amber-300', 'text-amber-500')}`} />
                  <span className={`truncate ${unreadDe(n.path) > 0 ? 'font-bold' : ''} ${n.seleccionable ? '' : 'italic opacity-70'}`}>{sis ? t(sis.label) : n.nombre}</span>
                  {contador(unreadDe(n.path), sel)}
                </button>
                {abiertaN && n.hijos.map((h) => renderNodo(h, nivel + 1))}
              </React.Fragment>
            );
          };
          cuerpo = (
            <>
              {estado === 'error' && <p className={`py-1 pl-7 text-[11px] ${c('text-amber-300', 'text-amber-600')}`}>{t("No se pudieron leer las carpetas de este buzón.")}</p>}
              {arbol.map((n) => renderNodo(n, 1))}
            </>
          );
        }
      }
    }

    return (
      <div key={`${cuenta.tipo}:${cuenta.id}`} className="mb-1">
        <button type="button" onClick={() => alternar(kCuenta)}
          className={`flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left text-[13px] font-bold ${c('text-slate-100 hover:bg-white/5', 'text-slate-800 hover:bg-slate-100')}`}>
          {flecha(abierta, () => alternar(kCuenta))}
          <Mail size={15} className={`shrink-0 ${esActiva ? c('text-red-400', 'text-red-600') : c('text-sky-300', 'text-sky-600')}`} />
          <span className="truncate" title={cuenta.email}>{cuenta.email}</span>
          {cuenta.sinSesion && <span className={`shrink-0 text-[10px] font-medium ${c('text-amber-300', 'text-amber-600')}`}>{t("reconectar")}</span>}
          {!abierta && contador(totalCuenta, false)}
        </button>
        {cuerpo}
      </div>
    );
  };

  return (
    <div className={`flex h-full min-h-0 flex-col ${c('bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)]', 'bg-white')}`}>
      <div className={`flex-shrink-0 border-b px-3 py-3 ${c('border-white/10', 'border-slate-200')}`}>
        <button type="button" onClick={onRedactar}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ab0433] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#8f022a]">
          <Plus size={16} />{t("Nuevo mensaje")}</button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label={t("Buzones")}>
        {cuentas.length === 0
          ? <p className={`px-2 py-3 text-xs ${c('text-slate-400', 'text-slate-500')}`}>{t("No hay buzones conectados.")}</p>
          : cuentas.map(renderCuenta)}
      </nav>
    </div>
  );
}
