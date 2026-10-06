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

// Regla del 06/10/2026: solo se avisa de una vista si el correo contiene la
// palabra "vista" Y un número de autos.
import { cumpleReglaVista } from '../src/services/vistasAutomation';

test('regla vista + autos', () => {
  assert.equal(cumpleReglaVista('ASIGNO VISTA 06/10/2026 9:50 PLAZA 16 MURCIA AUTOS 000945/2023').ok, true, 'señalamiento real');
  assert.equal(cumpleReglaVista('Nos vemos en la vista del 20/11/2026 a las 11:00').ok, false, 'habla de una vista pero sin autos');
  assert.equal(cumpleReglaVista('Apartamento con vista al mar, oferta hasta el 20/11/2026').ok, false, 'publicidad');
  assert.equal(cumpleReglaVista('Remito instructa de los autos 945/2023').ok, false, 'tiene autos pero no dice vista');
  assert.equal(cumpleReglaVista('Se señala vista para el 20/11/2026 a las 11:00 en el Juzgado nº 3', '512/2026').ok, true, 'autos leídos por la IA (p.ej. del PDF)');
  assert.equal(cumpleReglaVista('Entrevista el 20/11/2026, expediente 512/2026').ok, false, '"entrevista" no es "vista"');
  assert.equal(cumpleReglaVista('Revista jurídica nº 945/2023').ok, false, '"revista" no es "vista"');
});
