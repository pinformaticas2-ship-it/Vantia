import { Response } from 'express';
import path from 'path';
import { resolverPlantilla } from './filesController';
import { camposDePlantilla, rellenarPlantilla, leerComoDocx, claveCanonica } from '../services/plantillasWord';
import { contextoPlantilla, valorVantia, valoresGuardados, guardarValores, grupoDe, etiquetaDe, esDeDespacho } from '../services/plantillasDatos';
import { logActivityForReq } from './activityController';

// ── Rellenar plantillas Word (15/10/2026) ───────────────────────────────────
// GET  /api/files/templates/campos?path=&expedienteId=
//      Qué campos usa la plantilla y con qué valor saldría cada uno.
// POST /api/files/templates/generar  { path, expedienteId, valores }
//      Devuelve el .docx relleno y recuerda lo escrito a mano.
// Las plantillas .doc antiguas se convierten antes a .docx (LibreOffice).

const ORDEN_GRUPOS = ['Expediente', 'Cliente', 'Contrario', 'Juzgado', 'Procurador', 'Procurador contrario', 'Abogado', 'Abogado contrario', 'Despacho', 'Otros'];

function clienteDeLaPeticion(req: any): string | null {
  const id = String(req.query.clienteId || req.body?.clienteId || '').trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

async function expedienteDeLaOrg(req: any): Promise<string | null> {
  const id = String(req.query.expedienteId || req.body?.expedienteId || '').trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export const camposPlantilla = async (req: any, res: Response) => {
  const ruta = resolverPlantilla(req.query.path as string | undefined);
  if (!ruta) return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
  try {
    const expedienteId = await expedienteDeLaOrg(req);
    const docx = await leerComoDocx(ruta);
    const nombres = camposDePlantilla(docx);
    const clienteId = expedienteId ? null : clienteDeLaPeticion(req);
    const ctx = await contextoPlantilla(req.organizacionId, expedienteId, clienteId);
    if (expedienteId && !ctx.exp) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    if (clienteId && !(ctx as any).clienteEncontrado) return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
    const guardados = await valoresGuardados(req.organizacionId, expedienteId);
    const campos = nombres.map((nombre) => {
      const clave = claveCanonica(nombre);
      const deVantia = valorVantia(nombre, ctx);
      const guardado = guardados.get(clave);
      // Lo escrito a mano manda (alguien lo corrigió a propósito); si no, lo de Vantia.
      const valor = guardado ?? deVantia ?? '';
      return {
        nombre, clave,
        etiqueta: etiquetaDe(nombre),
        grupo: grupoDe(clave).grupo,
        valor,
        origen: guardado != null ? 'guardado' : deVantia ? 'vantia' : 'vacio',
        conoceVantia: deVantia !== undefined,
        deDespacho: esDeDespacho(nombre),
      };
    }).sort((a, b) => ORDEN_GRUPOS.indexOf(a.grupo) - ORDEN_GRUPOS.indexOf(b.grupo) || a.etiqueta.localeCompare(b.etiqueta, 'es'));
    res.json({ success: true, data: { campos, convertida: !ruta.toLowerCase().endsWith('.docx') } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo leer la plantilla.' });
  }
};

export const generarPlantilla = async (req: any, res: Response) => {
  const ruta = resolverPlantilla(req.body?.path);
  if (!ruta) return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
  try {
    const expedienteId = await expedienteDeLaOrg(req);
    const clienteId = expedienteId ? null : clienteDeLaPeticion(req);
    const ctx = await contextoPlantilla(req.organizacionId, expedienteId, clienteId);
    if (expedienteId && !ctx.exp) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    if (clienteId && !(ctx as any).clienteEncontrado) return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
    const docx = await leerComoDocx(ruta);
    const nombres = camposDePlantilla(docx);
    const enviados: Record<string, string> = req.body?.valores && typeof req.body.valores === 'object' ? req.body.valores : {};
    const enviadosPorClave = new Map(Object.entries(enviados).map(([k, v]) => [claveCanonica(k), String(v ?? '')]));
    const guardados = await valoresGuardados(req.organizacionId, expedienteId);

    const valores: Record<string, string> = {};
    const aGuardar: Record<string, string> = {};
    for (const nombre of nombres) {
      const clave = claveCanonica(nombre);
      const deVantia = valorVantia(nombre, ctx);
      const enviado = enviadosPorClave.get(clave);
      const valor = enviado ?? guardados.get(clave) ?? deVantia;
      if (valor !== undefined) valores[clave] = valor;
      // Se recuerda lo que difiere de lo que Vantia ya sabe (o lo que Vantia no sabe).
      if (enviado !== undefined && enviado !== (deVantia ?? '')) aGuardar[nombre] = enviado;
      else if (enviado !== undefined && guardados.has(clave) && enviado === (deVantia ?? '')) aGuardar[nombre] = ''; // vuelve a lo de Vantia
    }
    if (Object.keys(aGuardar).length) await guardarValores(req.organizacionId, expedienteId, req.auth?.userId || '', aGuardar);

    const salida = rellenarPlantilla(docx, valores);
    const nombreArchivo = path.basename(ruta).replace(/\.docx?$/i, '') + '.docx';
    if (expedienteId) {
      logActivityForReq(req, `Documento generado desde la plantilla «${path.basename(ruta)}»`, 'EXPEDIENTE', expedienteId).catch(() => {});
    } else if (clienteId) {
      logActivityForReq(req, `Documento generado desde la plantilla «${path.basename(ruta)}»`, 'CLIENT', clienteId).catch(() => {});
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`);
    res.send(salida);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo generar el documento.' });
  }
};
