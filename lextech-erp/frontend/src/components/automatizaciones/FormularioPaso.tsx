import React from 'react';
import { Check, Plus, X } from 'lucide-react';
import { t } from '../../lib/i18n';
import { Campo, CampoCorreo, campoCls } from './campos';
import { OPERADORES, reglasDe, type Catalogo, type TipoNodo, type Variable } from './tipos';

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
          {c.evento === 'tarea.vence' && (
            <Campo etiqueta={t('¿Cuántos días antes del plazo?')}>
              <select className={campoCls} value={c.diasAntes ?? 2} onChange={(e) => set('diasAntes', Number(e.target.value))}>
                {[0, 1, 2, 3, 5, 7, 10, 15].map((d) => <option key={d} value={d}>{d === 0 ? t('El mismo día') : t('{n} días antes', { n: d })}</option>)}
              </select>
            </Campo>
          )}
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
      const reglas = reglasDe(c);
      const setRegla = (i: number, k: string, v: string) => set('reglas', reglas.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
      return (
        <>
          {reglas.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              {[['y', t('Se cumplen todas')], ['o', t('Se cumple alguna')]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => set('modo', v)} className={`flex-1 rounded-md px-2 py-1.5 ${(c.modo || 'y') === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
          )}
          {reglas.map((x, i) => {
            const op = OPERADORES.find((o) => o.v === x.operador);
            return (
              <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-slate-400">{i === 0 ? t('Regla') : (c.modo === 'o' ? t('o') : t('y'))}</span>
                  {reglas.length > 1 && <button type="button" onClick={() => set('reglas', reglas.filter((_, j) => j !== i))} className="rounded p-0.5 text-slate-400 hover:text-red-600"><X size={13} /></button>}
                </div>
                <select className={campoCls} value={x.campo || ''} onChange={(e) => setRegla(i, 'campo', e.target.value)}>
                  <option value="">{t('Elige un dato…')}</option>
                  {variables.map((v) => <option key={v.clave} value={v.clave}>{t(v.etiqueta)}</option>)}
                </select>
                <select className={campoCls} value={x.operador || 'igual'} onChange={(e) => setRegla(i, 'operador', e.target.value)}>
                  {OPERADORES.map((o) => <option key={o.v} value={o.v}>{t(o.l)}</option>)}
                </select>
                {!op?.sinValor && <input className={campoCls} value={x.valor || ''} placeholder={t('Valor')} onChange={(e) => setRegla(i, 'valor', e.target.value)} />}
              </div>
            );
          })}
          {reglas.length < 10 && (
            <button type="button" onClick={() => set('reglas', [...reglas, { campo: '', operador: 'no_vacio', valor: '' }])}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline"><Plus size={13} />{t('Añadir regla')}</button>
          )}
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t('Conecta la salida verde («Sí») y la roja («No») con lo que debe pasar en cada caso. Sin distinguir mayúsculas.')}</p>
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
    case 'crear_cita':
      return (
        <>
          <Campo etiqueta={t('Título')}><input className={campoCls} value={c.titulo || ''} onChange={(e) => set('titulo', e.target.value)} /></Campo>
          <div className="grid grid-cols-3 gap-2">
            <Campo etiqueta={t('Dentro de (días)')}><input type="number" min={0} max={365} className={campoCls} value={c.dias ?? 1} onChange={(e) => set('dias', Math.max(0, Number(e.target.value) || 0))} /></Campo>
            <Campo etiqueta={t('Hora')}><input type="time" className={campoCls} value={c.hora || '10:00'} onChange={(e) => set('hora', e.target.value || '10:00')} /></Campo>
            <Campo etiqueta={t('Minutos')}><input type="number" min={15} max={600} step={15} className={campoCls} value={c.duracion ?? 60} onChange={(e) => set('duracion', Number(e.target.value) || 60)} /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta={t('Tipo')}>
              <select className={campoCls} value={c.tipo || 'cita'} onChange={(e) => set('tipo', e.target.value)}>
                {(catalogo?.tiposCita || ['cita']).map((x) => <option key={x} value={x}>{t({ cita: 'Cita', reunion: 'Reunión', llamada: 'Llamada', video: 'Videollamada', vista: 'Vista oral', otro: 'Otro' }[x] || x)}</option>)}
              </select>
            </Campo>
            <Campo etiqueta={t('En la agenda de')}>
              <select className={campoCls} value={c.asignar || 'responsable'} onChange={(e) => set('asignar', e.target.value)}>
                <option value="responsable">{t('El responsable')}</option><option value="usuario">{t('Quien lo hizo')}</option>
                {(catalogo?.miembros || []).map((m) => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta={t('Descripción')}><textarea rows={2} className={campoCls} value={c.descripcion || ''} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
          <Variables vars={vars} />
        </>
      );
    case 'enviar_whatsapp':
      return (
        <>
          <Campo etiqueta={t('Mensaje')}><textarea rows={4} className={campoCls} value={c.texto || ''} onChange={(e) => set('texto', e.target.value)} /></Campo>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{t('WhatsApp solo deja escribir texto libre si el cliente te escribió en las últimas 24 horas. Si no, el paso falla y queda en el historial.')}</p>
          <p className="text-[11px] text-slate-400">{t('Se envía al teléfono del cliente o de la oportunidad, desde el número de WhatsApp conectado en Integraciones.')}</p>
          <Variables vars={vars} />
        </>
      );
    case 'mover_crm':
      return (
        <>
          <Campo etiqueta={t('Mover a la etapa')}>
            <select className={campoCls} value={c.etapaId || ''} onChange={(e) => set('etapaId', e.target.value)}>
              <option value="">{t('Elige una etapa…')}</option>
              {(catalogo?.etapasCrm || []).map((e) => <option key={e.id} value={e.id}>{e.embudo} · {e.nombre}</option>)}
            </select>
          </Campo>
          <p className="text-[11px] text-slate-400">{t('Solo funciona con disparadores del CRM. Para marcar una oportunidad como perdida hace falta un motivo: eso se hace a mano.')}</p>
        </>
      );
    case 'estado_expediente':
      return (
        <>
          <Campo etiqueta={t('Nuevo estado')}>
            <select className={campoCls} value={c.estado || 'cerrado'} onChange={(e) => set('estado', e.target.value)}>
              {(catalogo?.estadosExpediente || ['abierto', 'suspendido', 'cerrado', 'archivado']).map((x) => <option key={x} value={x}>{t(x)}</option>)}
            </select>
          </Campo>
          <p className="text-[11px] text-slate-400">{t('Solo funciona con disparadores que tengan expediente.')}</p>
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
