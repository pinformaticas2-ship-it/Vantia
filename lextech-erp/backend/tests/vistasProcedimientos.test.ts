// Ejecutar con: npm test  (desde lextech-erp/backend)
//
// Correos de un procedimiento ya conocido (05/10/2026): "ASIGNO VISTA ...
// AUTOS 000945/2023" y después "REMITO INSTRUCTA" del mismo procedimiento se
// trataban como dos vistas nuevas, y "000945/2023" no se reconocía como
// "945/2023". Estas pruebas fijan la normalización y la clasificación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAutos, normalizeNig, extractProcedureRefs, clasificarSolicitud, Relacion } from '../src/services/vistasAutomation';

test('mismos autos escritos de formas distintas', () => {
  assert.equal(normalizeAutos('000945/2023'), '945/2023');
  assert.equal(normalizeAutos('945 / 2023'), '945/2023');
  assert.equal(normalizeAutos('Autos 945/23'), '945/2023');
  assert.equal(normalizeAutos('sin número'), null);
  assert.equal(normalizeNig('NIG 3003042120230012345'), '3003042120230012345');
});

test('extrae autos y NIG de un texto sin confundirlos con fechas', () => {
  const r = extractProcedureRefs('ASIGNO VISTA 06/10/2026 9:50 PLAZA 16 MURCIA AUTOS 000945/2023. NIG: 3003042120230012345');
  assert.deepEqual(r.autos, ['945/2023'], 'la fecha 06/10/2026 no es un número de autos');
  assert.ok(r.nigs.includes('3003042120230012345'));
});

const rel = (vistaFecha?: string): Relacion => ({
  autos: '945/2023', nig: null,
  expediente: { id: 'e1', anio: 2026, num_exp: 3, descripcion: null, num_autos: '000945/2023', cliente_nombre: null },
  vista: vistaFecha ? { id: 'v1', fecha_vista: vistaFecha, agenda_event_id: 'a1', juzgado: null } : null,
});

test('clasificación de los correos', () => {
  const d = new Date('2026-10-06T07:50:00Z');
  assert.equal(clasificarSolicitud(true, d, null), 'vista', 'señalamiento de un procedimiento desconocido: vista nueva');
  assert.equal(clasificarSolicitud(true, d, rel()), 'vista', 'expediente existente sin vista aceptada: vista nueva de ese expediente');
  assert.equal(clasificarSolicitud(true, d, rel('2026-10-06T07:50:00Z')), 'documentacion', 'mismo señalamiento repetido (p.ej. remisión): documentación');
  assert.equal(clasificarSolicitud(true, d, rel('2026-09-30T08:00:00Z')), 'cambio', 'mismos autos, otra fecha: cambio de la vista');
  assert.equal(clasificarSolicitud(false, null, rel()), 'documentacion', 'correo sin señalamiento de un procedimiento conocido: documentación');
  assert.equal(clasificarSolicitud(false, null, null), null, 'correo sin relación ni vista: nada que hacer');
});
