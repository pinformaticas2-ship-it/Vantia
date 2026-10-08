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

// 08/10/2026: detectar mejor dónde se celebra y las cancelaciones.
import { extraerLugar, provinciaPorNig, localidadDeJuzgado, esTextoDeCancelacion, cancelaVista, extractWithPatterns } from '../src/services/vistasAutomation';

test('dónde se celebra: juzgado, sede y localidad', () => {
  assert.equal(extraerLugar('ASIGNO VISTA 06/10/2026 9:50 PLAZA 16 MURCIA AUTOS 000945/2023').juzgado, 'Tribunal de Instancia de Murcia, Plaza nº 16');
  const ti = extraerLugar('TRIBUNAL DE INSTANCIA DE ORIHUELA, Sección Civil, Plaza nº 2\nCédula de citación');
  assert.equal(ti.juzgado, 'Tribunal de Instancia de Orihuela, Sección Civil, Plaza nº 2');
  assert.equal(ti.localidad, 'Orihuela');
  const jpi = extraerLugar('JUZGADO DE PRIMERA INSTANCIA Nº 3 DE MURCIA\nCiudad de la Justicia, Avda. Ronda de Garay, 5, 30003 Murcia');
  assert.equal(jpi.juzgado, 'JUZGADO DE PRIMERA INSTANCIA Nº 3 DE MURCIA');
  assert.equal(jpi.localidad, 'Murcia');
  assert.match(jpi.direccion || '', /Ciudad de la Justicia/);
  assert.match(jpi.direccion || '', /Ronda de Garay, 5/);
  assert.equal(extraerLugar('Señalamiento JPI 4 de Cartagena, autos 12/2026').juzgado, 'Juzgado de Primera Instancia nº 4 de Cartagena');
  assert.equal(extraerLugar('Audiencia Provincial de Alicante, Sección 9ª, rollo 55/2026').juzgado, 'Audiencia Provincial de Alicante, Sección 9ª');
  assert.equal(extraerLugar('Domicilio: C/ Mayor 4, 03300 ORIHUELA').localidad, 'Orihuela');
  assert.equal(localidadDeJuzgado('Juzgado de Primera Instancia e Instrucción nº 2 de Orihuela'), 'Orihuela');
  assert.equal(localidadDeJuzgado('Juzgado de Primera Instancia e Instrucción'), null);
  assert.equal(provinciaPorNig('3003042120230012345'), 'Provincia de Murcia (según el NIG)');
  assert.equal(provinciaPorNig('0309942120230012345'), 'Provincia de Alicante (según el NIG)');
  // Sin IA: los patrones devuelven ya juzgado y localidad.
  const p = extractWithPatterns('VISTA 20/11/2027 10:00 PLAZA 3 ORIHUELA', 'Autos 77/2027');
  assert.equal(p.juzgado, 'Tribunal de Instancia de Orihuela, Plaza nº 3');
  assert.equal(p.localidad, 'Orihuela');
});

test('cancelaciones: suspensión de la misma vista sí; cambio de fecha no', () => {
  assert.equal(esTextoDeCancelacion('Se suspende la vista señalada para el día 12/10/2026 en los autos 945/2023'), true);
  assert.equal(esTextoDeCancelacion('El señalamiento del juicio queda sin efecto.'), true);
  assert.equal(esTextoDeCancelacion('SUSPENSIÓN VISTA AUTOS 945/2023'), true);
  assert.equal(esTextoDeCancelacion('Se suspende la vista y se señala nuevamente para el 20/11/2026'), false);
  assert.equal(esTextoDeCancelacion('Se aplaza la vista del 12/10/2026 al 20/11/2026'), false);
  assert.equal(esTextoDeCancelacion('Le recordamos la vista del 12/10/2026'), false);
  assert.equal(esTextoDeCancelacion('Cancelamos la suscripción a la revista'), false, 'sin acto procesal cerca');

  const vista = { fecha_vista: '2026-10-12T10:00:00Z' };
  const base = { es_vista: false, cancelada: false, fecha_vista: null } as any;
  assert.equal(cancelaVista({ ...base, fecha_vista: '2026-10-12' }, 'Se suspende la vista', vista), true, 'mismo día');
  assert.equal(cancelaVista({ ...base }, 'Se suspende la vista', vista), true, 'sin fecha en el correo: la vista de esos autos');
  assert.equal(cancelaVista({ ...base, fecha_vista: '2026-10-19' }, 'Se suspende la vista', vista), false, 'otro día: no es esa vista');
  assert.equal(cancelaVista({ ...base, cancelada: true, fecha_vista: '2026-10-12' }, 'Diligencia', vista), true, 'la IA lo detecta');
  assert.equal(cancelaVista({ ...base }, 'Se suspende la vista', null), false, 'sin vista aceptada no hay nada que cancelar');
});
