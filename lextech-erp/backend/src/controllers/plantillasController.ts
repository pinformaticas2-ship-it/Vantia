import { Response } from 'express';
import path from 'path';
import { rutaPlantillaOrg, nombrePlantillaOrg } from './filesController';
import { camposDePlantilla, rellenarPlantilla, leerComoDocx, claveCanonica } from '../services/plantillasWord';
import { contextoPlantilla, valoresGuardados, guardarValores, grupoDe, etiquetaDe, esDeDespacho, esCampoLogo, logoDespacho, logoDespachoConAviso, configParaPlantilla, ajustesDePlantilla, refPlantilla, resolverValor } from '../services/plantillasDatos';
import { logActivityForReq } from './activityController';

// ── Rellenar plantillas Word (15/10/2026) ───────────────────────────────────
// GET  /api/files/templates/campos?path=&expedienteId=
//      Qué campos usa la plantilla y con qué valor saldría cada uno.
// POST /api/files/templates/generar  { path, expedienteId, valores }
//      Devuelve el .docx relleno y recuerda lo escrito a mano.
// Las plantillas .doc antiguas se convierten antes a .docx (LibreOffice).

const ORDEN_GRUPOS = ['Variables del despacho', 'Expediente', 'Cliente', 'Contrario', 'Juzgado', 'Procurador', 'Procurador contrario', 'Abogado', 'Abogado contrario', 'Despacho', 'Otros'];

function clienteDeLaPeticion(req: any): string | null {
  const id = String(req.query.clienteId || req.body?.clienteId || '').trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

async function expedienteDeLaOrg(req: any): Promise<string | null> {
  const id = String(req.query.expedienteId || req.body?.expedienteId || '').trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export const camposPlantilla = async (req: any, res: Response) => {
  const ruta = await rutaPlantillaOrg(req.organizacionId, req.query.path as string | undefined);
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
    // Lo general del despacho con los ajustes de esta plantilla encima.
    const config = await configParaPlantilla(req.organizacionId, req.query.path as string);
    const ajustes = await ajustesDePlantilla(req.organizacionId, req.query.path as string);
    const { logo, aviso: avisoLogo } = nombres.some(esCampoLogo) ? await logoDespachoConAviso(req.organizacionId) : { logo: null, aviso: null };
    const campos = nombres.map((nombre) => {
      const clave = claveCanonica(nombre);
      // El logo es una imagen: sale de Mi Despacho, no se escribe.
      if (esCampoLogo(nombre)) {
        return {
          nombre, clave, etiqueta: etiquetaDe(nombre), grupo: grupoDe(clave).grupo,
          valor: logo ? 'Logo de Mi Despacho' : '', origen: logo ? 'vantia' : 'vacio',
          conoceVantia: true, deDespacho: true, imagen: true, imagenUrl: logo?.url || null, avisoImagen: avisoLogo,
        };
      }
      // Ver resolverValor: valor fijo del despacho, desactivada, lo escrito a
      // mano (salvo lo que ya está en Mi Despacho) y si no, lo de Vantia.
      const cfg = config.get(clave);
      const r = resolverValor(nombre, ctx, guardados, config);
      return {
        nombre, clave,
        etiqueta: cfg?.etiqueta || etiquetaDe(nombre),
        grupo: cfg?.propia ? 'Variables del despacho' : grupoDe(clave).grupo,
        valor: r.valor ?? '',
        origen: r.origen,
        conoceVantia: r.deVantia !== undefined,
        deDespacho: esDeDespacho(nombre) && !cfg?.propia,
        // Variables propias: cómo se escriben (fecha, opciones...).
        formato: cfg?.propia && cfg.modo === 'expediente' ? (cfg.formato || null) : null,
        // Ajuste solo de esta plantilla (null = como en general).
        enPlantilla: ajustes.has(clave) ? { estado: ajustes.get(clave)!.estado, valor: ajustes.get(clave)!.valor ?? '' } : null,
      };
    }).sort((a, b) => ORDEN_GRUPOS.indexOf(a.grupo) - ORDEN_GRUPOS.indexOf(b.grupo) || a.etiqueta.localeCompare(b.etiqueta, 'es'));
    res.json({ success: true, data: {
      campos, convertida: !ruta.toLowerCase().endsWith('.docx'),
      plantilla: refPlantilla(req.query.path as string),
      canManage: ['propietario', 'admin'].includes(req.organizacionRol),
    } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo leer la plantilla.' });
  }
};

export const generarPlantilla = async (req: any, res: Response) => {
  const ruta = await rutaPlantillaOrg(req.organizacionId, req.body?.path);
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
    const config = await configParaPlantilla(req.organizacionId, req.body?.path);

    const valores: Record<string, string> = {};
    const aGuardar: Record<string, string> = {};
    const logo = nombres.some(esCampoLogo) ? await logoDespacho(req.organizacionId) : null;
    const imagenes: Record<string, { buffer: Buffer; mime: string }> = {};
    for (const nombre of nombres) {
      const clave = claveCanonica(nombre);
      if (esCampoLogo(nombre)) { if (logo) imagenes[clave] = logo; continue; }
      const enviado = enviadosPorClave.get(clave);
      const { valor, deVantia } = resolverValor(nombre, ctx, guardados, config, enviado);
      if (valor !== undefined) valores[clave] = valor;
      // Se recuerda lo que difiere de lo que Vantia ya sabe (o lo que Vantia no sabe).
      // Las de valor fijo no: ese valor se cambia en Variables de documentos.
      const cfg = config.get(clave);
      if (cfg?.activa && (cfg.modo === 'fijo' || cfg.modo === 'formula' || cfg.modo === 'dato')) continue;
      // Si se deja el valor por defecto tal cual, no se guarda (así sigue calculándose).
      if (enviado !== undefined && cfg?.propia && cfg.formato?.defecto) {
        const sin = resolverValor(nombre, ctx, guardados, config);
        if (sin.origen === 'defecto' && sin.valor === enviado) continue;
      }
      if (enviado !== undefined && enviado !== (deVantia ?? '')) aGuardar[nombre] = enviado;
      else if (enviado !== undefined && guardados.has(clave) && enviado === (deVantia ?? '')) aGuardar[nombre] = ''; // vuelve a lo de Vantia
    }
    if (Object.keys(aGuardar).length) await guardarValores(req.organizacionId, expedienteId, req.auth?.userId || '', aGuardar);

    const salida = rellenarPlantilla(docx, valores, imagenes);
    const nombreTpl = await nombrePlantillaOrg(req.organizacionId, req.body.path);
    const nombreArchivo = nombreTpl.replace(/\.docx?$/i, '') + '.docx';
    if (expedienteId) {
      logActivityForReq(req, `Documento generado desde la plantilla «${nombreTpl}»`, 'EXPEDIENTE', expedienteId).catch(() => {});
    } else if (clienteId) {
      logActivityForReq(req, `Documento generado desde la plantilla «${nombreTpl}»`, 'CLIENT', clienteId).catch(() => {});
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`);
    res.send(salida);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo generar el documento.' });
  }
};
