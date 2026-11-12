import React from 'react';
import { Check } from 'lucide-react';
import { t } from '../../lib/i18n';
import { Campo, CampoCorreo, campoCls } from './campos';
import { OPERADORES, type Catalogo, type TipoNodo, type Variable } from './tipos';

// Ajustes de cada tipo de paso, en el panel derecho del lienzo.

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function FormularioPaso({ tipo, config, set, catalogo, variables, vinculada }: {
  tipo: TipoNodo; config: Record<string, any>; set: (k: string, v: any) => void;
  catalogo: Catalogo | null; variables: Variable[]; vinculada?: boolean;
}) {
  const vars = variables.map((v) => ({ clave: v.clave, desc: t(v.etiqueta) }));
  const c = config;
  switch (tipo) {
    case 'disparador':
      if (vinculada) return null;
      return (
        <>
          <div className="space-y-1.5">
            {(catalogo?.disparadores || []).map((d) => (
              <button key={d.clave} type="button" onClick={() => set('evento', d.clave)}
                className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${c.evento === d.clave ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${c.evento === d.clave ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'}`}>{c.evento === d.clave && <Check size={10} />}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{t(d.etiqueta)}</span>
                  <span className="block text-xs text-slate-500">{t(d.descripcion)}</span>
                </span>
              </button>
            ))}
          </div>
          {c.evento === 'programado' && (
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta={t('Frecuencia')}>
                <select className={campoCls} value={c.frecuencia || 'diaria'} onChange={(e) => set('frecuencia', e.target.value)}>
                  <option value="diaria">{t('Cada día')}</option><option value="semanal">{t('Cada semana')}</option><option value="mensual">{t('Cada mes')}</option>
                </select>
              </Campo>
              <Campo etiqueta={t('Hora')}><input type="time" className={campoCls} value={c.hora || '09:00'} onChange={(e) => set('hora', e.target.value || '09:00')} /></Campo>
              {c.frecuencia === 'semanal' && (
                <Campo etiqueta={t('Día')}>
                  <select className={campoCls} value={c.dia || 1} onChange={(e) => set('dia', Number(e.target.value))}>
                    {DIAS.map((d, i) => <option key={d} value={i + 1}>{t(d)}</option>)}
                  </select>
                </Campo>
              )}
              {c.frecuencia === 'mensual' && (
                <Campo etiqueta={t('Día del mes')}><input type="number" min={1} max={28} className={campoCls} value={c.dia || 1} onChange={(e) => set('dia', Math.max(1, Math.min(28, Number(e.target.value) || 1)))} /></Campo>
              )}
            </div>
          )}
        </>
      );
    case 'condicion': {
      const op = OPERADORES.find((o) => o.v === c.operador);
      return (
        <>
          <Campo etiqueta={t('¿Qué se comprueba?')}>
            <select className={campoCls} value={c.campo || ''} onChange={(e) => set('campo', e.target.value)}>
              <option value="">{t('Elige un dato…')}</option>
              {variables.map((v) => <option key={v.clave} value={v.clave}>{t(v.etiqueta)}</option>)}
            </select>
          </Campo>
          <Campo etiqueta={t('Condición')}>
            <select className={campoCls} value={c.operador || 'igual'} onChange={(e) => set('operador', e.target.value)}>
              {OPERADORES.map((o) => <option key={o.v} value={o.v}>{t(o.l)}</option>)}
            </select>
          </Campo>
          {!op?.sinValor && <Campo etiqueta={t('Valor')} ayuda={t('Sin distinguir mayúsculas.')}><input className={campoCls} value={c.valor || ''} onChange={(e) => set('valor', e.target.value)} /></Campo>}
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t('Conecta la salida verde («Sí») y la roja («No») con lo que debe pasar en cada caso.')}</p>
        </>
      );
    }
    case 'esperar':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta={t('Cuánto')}><input type="number" min={1} max={999} className={campoCls} value={c.cantidad || 1} onChange={(e) => set('cantidad', Math.max(1, Number(e.target.value) || 1))} /></Campo>
          <Campo etiqueta={t('Unidad')}>
            <select className={campoCls} value={c.unidad || 'dias'} onChange={(e) => set('unidad', e.target.value)}>
              <option value="minutos">{t('minutos')}</option><option value="horas">{t('horas')}</option><option value="dias">{t('días')}</option>
            </select>
          </Campo>
        </div>
      );
    case 'enviar_correo':
      return (
        <>
          <Campo etiqueta={t('Para')}>
            <select className={campoCls} value={c.para || 'cliente'} onChange={(e) => set('para', e.target.value)}>
              <option value="cliente">{t('El cliente')}</option><option value="otro">{t('Otras direcciones')}</option>
            </select>
          </Campo>
          {c.para === 'otro' && <Campo etiqueta={t('Direcciones')} ayuda={t('Separadas por comas. Máximo 10.')}><input className={campoCls} value={c.direcciones || ''} onChange={(e) => set('direcciones', e.target.value)} placeholder="ana@despacho.es, luis@despacho.es" /></Campo>}
          <CampoCorreo asunto={c.asunto || ''} cuerpo={c.cuerpo || ''} onAsunto={(v) => set('asunto', v)} onCuerpo={(v) => set('cuerpo', v)} variables={vars} />
          <p className="text-[11px] text-slate-400">{t('Sale desde la cuenta de correo del despacho. Como mucho 100 correos al día entre todas las automatizaciones.')}</p>
        </>
      );
    case 'aviso_equipo':
      return (
        <>
          <Campo etiqueta={t('A quién')}>
            <select className={campoCls} value={c.a || 'usuario'} onChange={(e) => set('a', e.target.value)}>
              <option value="usuario">{t('A quien lo hizo')}</option><option value="responsable">{t('Al responsable')}</option>
              <option value="todos">{t('A todo el despacho')}</option><option value="personas">{t('A personas concretas')}</option>
            </select>
          </Campo>
          {c.a === 'personas' && (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {(catalogo?.miembros || []).map((m) => {
                const on = (c.personas || []).includes(m.userId);
                return (
                  <label key={m.userId} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={on} className="accent-red-600"
                      onChange={() => set('personas', on ? (c.personas || []).filter((x: string) => x !== m.userId) : [...(c.personas || []), m.userId])} />
                    {m.nombre}
                  </label>
                );
              })}
            </div>
          )}
          <Campo etiqueta={t('Título')}><input className={campoCls} value={c.titulo || ''} onChange={(e) => set('titulo', e.target.value)} /></Campo>
          <Campo etiqueta={t('Mensaje')}><textarea rows={3} className={campoCls} value={c.mensaje || ''} onChange={(e) => set('mensaje', e.target.value)} /></Campo>
          <Variables vars={vars} />
        </>
      );
    case 'crear_tarea':
      return (
        <>
          <Campo etiqueta={t('Título')}><input className={campoCls} value={c.titulo || ''} onChange={(e) => set('titulo', e.target.value)} /></Campo>
          <Campo etiqueta={t('Descripción')}><textarea rows={3} className={campoCls} value={c.descripcion || ''} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta={t('Plazo (días)')}><input type="number" min={0} max={365} className={campoCls} value={c.dias ?? 1} onChange={(e) => set('dias', Math.max(0, Number(e.target.value) || 0))} /></Campo>
            <Campo etiqueta={t('Prioridad')}>
              <select className={campoCls} value={c.prioridad || 'media'} onChange={(e) => set('prioridad', e.target.value)}>
                <option value="alta">{t('Alta@@prioridad')}</option><option value="media">{t('Media')}</option><option value="baja">{t('Baja@@prioridad')}</option>
              </select>
            </Campo>
          </div>
          <Campo etiqueta={t('Para')}>
            <select className={campoCls} value={c.asignar || 'usuario'} onChange={(e) => set('asignar', e.target.value)}>
              <option value="usuario">{t('Quien lo hizo')}</option><option value="responsable">{t('El responsable')}</option>
              {(catalogo?.miembros || []).map((m) => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
            </select>
          </Campo>
          <p className="text-[11px] text-slate-400">{t('Las tareas van ligadas a un cliente: solo funciona con disparadores que tengan cliente.')}</p>
          <Variables vars={vars} />
        </>
      );
    case 'mensaje_chat':
      return (
        <>
          <Campo etiqueta={t('Canal')}>
            <select className={campoCls} value={c.canalId || ''} onChange={(e) => set('canalId', e.target.value)}>
              <option value="">{t('Elige un canal…')}</option>
              {(catalogo?.canales || []).map((k) => <option key={k.id} value={k.id}>#{k.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta={t('Mensaje')}><textarea rows={4} className={campoCls} value={c.texto || ''} onChange={(e) => set('texto', e.target.value)} /></Campo>
          <Variables vars={vars} />
        </>
      );
    case 'webhook':
      return (
        <>
          <Campo etiqueta={t('Dirección (https)')} ayuda={t('Se envía un POST con los datos del disparador en JSON. Solo direcciones públicas.')}>
            <input className={campoCls} value={c.url || ''} onChange={(e) => set('url', e.target.value.trim())} placeholder="https://hooks.zapier.com/…" />
          </Campo>
        </>
      );
  }
  return null;
}

function Variables({ vars }: { vars: { clave: string; desc: string }[] }) {
  if (!vars.length) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-slate-500">{t('Puedes usar estos datos:')}</p>
      <div className="flex flex-wrap gap-1">
        {vars.map((v) => (
          <button key={v.clave} type="button" title={v.desc} onClick={() => void navigator.clipboard?.writeText(`{${v.clave}}`)}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:border-red-300" data-sin-traducir>{`{${v.clave}}`}</button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-slate-400">{t('Pulsa uno para copiarlo y pégalo en el texto.')}</p>
    </div>
  );
}
