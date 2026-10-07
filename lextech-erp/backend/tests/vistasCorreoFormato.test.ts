// Ejecutar con: npm test  (desde lextech-erp/backend)
//
// Configuración del correo de respuesta de las vistas (06/10/2026): firma,
// fuente/tamaño/color y cita del correo original.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVistasConfig, renderPlantilla, buildRespuestaHtml, DEFAULT_PLANTILLA_ACEPTAR } from '../src/services/vistasAutomation';

const vars = {
  asunto_original: 'Señalamiento', fecha: 'lunes, 20 de noviembre de 2026', hora: '09:30',
  juzgado: 'JPI 3', autos: '945/2026', abogado: 'Ana Pérez', despacho: 'Despacho X', mensaje: '',
};

test('sin configuración se mantiene el correo de siempre', () => {
  const cfg = normalizeVistasConfig({});
  const r = renderPlantilla(cfg.plantillaAceptar, vars, cfg.correo);
  assert.match(r.texto, /Un cordial saludo,\nAna Pérez\nDespacho X$/);
  assert.match(r.html, /font-family:Arial/);
  assert.doesNotMatch(r.html, /blockquote/);
});

test('plantillas guardadas antes de la firma no duplican la despedida', () => {
  const vieja = DEFAULT_PLANTILLA_ACEPTAR.cuerpo.replace('{firma}', 'Un cordial saludo,\n{abogado}\n{despacho}');
  const cfg = normalizeVistasConfig({ plantillaAceptar: { asunto: 'Re: x', cuerpo: vieja }, correo: { firma: 'Atentamente,\n{abogado}\nTel. 600 000 000' } });
  const r = renderPlantilla(cfg.plantillaAceptar, vars, cfg.correo);
  assert.match(r.texto, /Atentamente,\nAna Pérez\nTel\. 600 000 000$/);
  assert.doesNotMatch(r.texto, /cordial/);
});

test('firma vacía y formato configurado', () => {
  const cfg = normalizeVistasConfig({ correo: { firma: '', fuente: 'georgia', tamano: 'grande', color: '#112233' } });
  const r = renderPlantilla(cfg.plantillaAceptar, vars, cfg.correo);
  assert.doesNotMatch(r.texto, /\{firma\}|\n\n$/);
  assert.match(r.html, /Georgia/); assert.match(r.html, /16px/); assert.match(r.html, /#112233/);
});

test('valores no válidos vuelven a los de por defecto (sin inyectar CSS)', () => {
  const cfg = normalizeVistasConfig({ correo: { fuente: 'x;}</style>', tamano: 'enorme', color: 'red;background:url(x)' } });
  assert.equal(cfg.correo.fuente, 'arial'); assert.equal(cfg.correo.tamano, 'normal'); assert.equal(cfg.correo.color, '#1f2937');
});

test('cita del correo original, escapada', () => {
  const cfg = normalizeVistasConfig({ correo: { citarOriginal: true } });
  const html = buildRespuestaHtml('Hola', cfg.correo, { from: 'Proc <p@x.es>', fecha: new Date('2026-10-06T08:00:00Z'), texto: '<b>vista</b>\nautos 1/2026' });
  assert.match(html, /<blockquote/);
  assert.match(html, /Proc &lt;p@x\.es&gt; escribió:/);
  assert.match(html, /&lt;b&gt;vista&lt;\/b&gt;<br>autos/);
  assert.doesNotMatch(buildRespuestaHtml('Hola', normalizeVistasConfig({}).correo, { from: 'a', fecha: null, texto: 'x' }), /blockquote/);
});

test('firma registrada (HTML): sustituye a la de texto y se limpia', () => {
  const cfg = normalizeVistasConfig({ correo: {
    firmaNombre: 'Firma despacho',
    firmaHtml: '<p onclick="x()">Ana<br><img src="https://x.es/logo.png"></p><script>alert(1)</script><a href="javascript:alert(1)">w</a>',
  } });
  assert.equal(cfg.correo.firmaNombre, 'Firma despacho');
  assert.doesNotMatch(cfg.correo.firmaHtml, /script|onclick|javascript:/i);
  assert.match(cfg.correo.firmaHtml, /<img src="https:\/\/x\.es\/logo\.png">/);
  const r = renderPlantilla(cfg.plantillaAceptar, vars, cfg.correo);
  assert.doesNotMatch(r.texto, /cordial|\{firma\}/, 'el texto editable no lleva la firma de texto');
  assert.match(r.html, /<div style="margin-top:12px"><p>Ana/);
});

// 07/10/2026: un aviso legal en HTML pegado en la firma "de texto" salía como
// código y cortado a 1000 caracteres.
test('HTML pegado en la firma de texto se usa con su formato y sin cortar', () => {
  const aviso = '<div style="font-size:10px;color:#666">' + 'Le informamos de que sus datos serán tratados... '.repeat(60) + 'FIN</div>';
  const cfg = normalizeVistasConfig({ correo: { firma: aviso } });
  assert.equal(cfg.correo.firmaNombre, 'Pegada (HTML)');
  assert.match(cfg.correo.firmaHtml, /^<div style="font-size:10px;color:#666">/);
  assert.match(cfg.correo.firmaHtml, /FIN<\/div>$/, 'no se corta');
  const r = renderPlantilla(cfg.plantillaAceptar, vars, cfg.correo);
  assert.doesNotMatch(r.texto, /<div/, 'el texto editable no lleva el código');
  assert.match(r.html, /<div style="margin-top:12px"><div style="font-size:10px/);
  // Texto normal sigue siendo texto (p.ej. "<3" o un correo entre <>).
  assert.equal(normalizeVistasConfig({ correo: { firma: 'Ana <ana@x.es>' } }).correo.firmaHtml, '');
});
