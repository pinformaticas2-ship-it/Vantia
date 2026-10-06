// Ejecutar con: npm test  (desde lextech-erp/backend)
//
// Fiabilidad de la detección de vistas (06/10/2026): que un correo contenga
// "vista" o hable de una vista no debe bastar. Casos reales de falsos
// positivos y de señalamientos auténticos; nivel 'alta' = se avisa,
// 'media' = dudosa sin aviso, 'baja' = descartada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarSenalamiento, evaluarDocumentacion, VistaDatos, RemitenteInfo, Relacion } from '../src/services/vistasAutomation';

const now = new Date('2026-10-06T10:00:00Z');
const futura = new Date('2026-11-20T10:00:00Z');
const base: VistaDatos = {
  es_vista: true, tipo_acto: 'vista', fecha_vista: '2026-11-20', hora_vista: '11:00', duracion_min: null,
  juzgado: null, sala: null, direccion: null, num_autos: null, nig: null, tipo_procedimiento: null, partes: null,
  cliente: null, contrario: null, fecha_preparacion: null, modalidad: null, enlace_telematico: null, resumen: null,
  confianza: null, motivo_ia: null,
};
const desconocido: RemitenteInfo = { confianza: null, descartadoAntes: false };
const ev = (o: Partial<Parameters<typeof evaluarSenalamiento>[0]> & { datos: Partial<VistaDatos> }) => evaluarSenalamiento({
  iaUsada: true, fechaVista: futura, now, remitente: desconocido, esRespuesta: false, relacion: null,
  ...o, datos: { ...base, ...o.datos },
});

test('señalamiento real (IA segura, autos y juzgado) de un remitente desconocido: se avisa', () => {
  const r = ev({ datos: { confianza: 0.92, num_autos: '945/2023', juzgado: 'Juzgado de lo Social nº 2 de Murcia' } });
  assert.equal(r.nivel, 'alta', JSON.stringify(r));
});

test('compañero: "nos vemos en la vista del 20/11 a las 11" -> descartado', () => {
  const r = ev({ datos: { es_vista: false, confianza: 0.1, motivo_ia: 'conversación que menciona una vista' }, esRespuesta: true });
  assert.equal(r.nivel, 'baja');
});

test('lo mismo SIN IA (solo patrones): tampoco cuela', () => {
  const r = ev({ iaUsada: false, datos: { es_vista: true }, esRespuesta: true });
  assert.equal(r.nivel, 'baja', JSON.stringify(r));
});

test('publicidad "apartamento con vista al mar, oferta hasta el 20/11" -> descartado', () => {
  assert.equal(ev({ datos: { es_vista: false, confianza: 0.02 } }).nivel, 'baja');
});

test('sin IA, señalamiento completo de un procurador de tu Directorio: se avisa', () => {
  const r = ev({ iaUsada: false, datos: { num_autos: '945/2023', juzgado: 'Juzgado nº 2' }, remitente: { confianza: 'directorio', descartadoAntes: false } });
  assert.equal(r.nivel, 'alta', JSON.stringify(r));
});

test('sin IA, señalamiento completo de un desconocido: dudoso, sin aviso', () => {
  const r = ev({ iaUsada: false, datos: { num_autos: '945/2023', juzgado: 'Juzgado nº 2' } });
  assert.equal(r.nivel, 'media', JSON.stringify(r));
});

test('fecha ya pasada (acta o resultado de una vista celebrada): no se avisa', () => {
  const r = ev({ datos: { confianza: 0.7, juzgado: 'Juzgado nº 2' }, fechaVista: new Date('2026-09-01T10:00:00Z') });
  assert.notEqual(r.nivel, 'alta', JSON.stringify(r));
});

test('remitente cuyos correos ya marcaste como "No es una vista": baja a dudoso o descartado', () => {
  const r = ev({ datos: { confianza: 0.6 }, remitente: { confianza: null, descartadoAntes: true } });
  assert.notEqual(r.nivel, 'alta', JSON.stringify(r));
});

test('cada señal deja su motivo', () => {
  const r = ev({ datos: { confianza: 0.9, num_autos: '945/2023' } });
  assert.ok(r.motivos.some((m) => /IA/.test(m.texto)));
  assert.ok(r.motivos.some((m) => /autos/.test(m.texto)));
  assert.equal(r.score, r.motivos.reduce((s, m) => s + m.puntos, 0));
});

const rel: Relacion = { autos: '945/2023', nig: null, expediente: { id: 'e', anio: 2026, num_exp: 3, descripcion: null, num_autos: '945/2023', cliente_nombre: null }, vista: null };

test('documentación de un procedimiento conocido con adjuntos: se avisa', () => {
  assert.equal(evaluarDocumentacion({ relacion: rel, remitente: desconocido, esRespuesta: false, tieneAdjuntos: true }).nivel, 'alta');
});

test('respuesta de conversación que solo cita los autos, sin adjuntos: no se avisa', () => {
  assert.notEqual(evaluarDocumentacion({ relacion: rel, remitente: desconocido, esRespuesta: true, tieneAdjuntos: false }).nivel, 'alta');
});
