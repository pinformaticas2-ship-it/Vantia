import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { camposDePlantilla, rellenarPlantilla, claveCanonica } from '../src/services/plantillasWord';
import { valorVantia, grupoDe, etiquetaDe } from '../src/services/plantillasDatos';

// Plantillas Word con campos de MN Program (ver services/plantillasWord.ts).

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
function docx(cuerpo: string, cabecera?: string): Buffer {
  const z = new AdmZip();
  z.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'));
  z.addFile('word/document.xml', Buffer.from(`<?xml version="1.0"?><w:document ${W}><w:body>${cuerpo}</w:body></w:document>`));
  if (cabecera) z.addFile('word/header1.xml', Buffer.from(`<?xml version="1.0"?><w:hdr ${W}>${cabecera}</w:hdr>`));
  return z.toBuffer();
}
const texto = (buf: Buffer, parte = 'word/document.xml') =>
  (new AdmZip(buf).readAsText(parte).match(/<w:t[^>]*>[^<]*<\/w:t>|<w:br\/>/g) || [])
    .map((s) => (s === '<w:br/>' ? '\n' : s.replace(/<[^>]+>/g, ''))).join('')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const run = (t: string, negrita = false) => `<w:r>${negrita ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;

test('marcador entero, partido en varios trozos y en la cabecera', () => {
  const plantilla = docx(
    `<w:p>${run('Demandante: «Clientes_Nombre», con NIF «Clientes_NIF/CIF».')}</w:p>` +
    // Word partió el marcador en cuatro trozos con formatos distintos
    `<w:p>${run('Juzgado: «Juzgado_Prin')}${run('cipal_', true)}${run('Nombre»')}${run(' — autos «Juzgado_Principal_Núm_Autos»')}</w:p>`,
    `<w:p>${run('«Empresa_Nombre»')}</w:p>`,
  );
  assert.deepEqual(new Set(camposDePlantilla(plantilla)), new Set(['Clientes_Nombre', 'Clientes_NIF/CIF', 'Juzgado_Principal_Nombre', 'Juzgado_Principal_Núm_Autos', 'Empresa_Nombre']));
  const out = rellenarPlantilla(plantilla, {
    Clientes_Nombre: 'Lucía Martínez & Cía <SL>', 'Clientes_NIF/CIF': '12345678Z',
    Juzgado_Principal_Nombre: 'Juzgado de lo Social nº 3 de Palma', Juzgado_Principal_Núm_Autos: '945/23', Empresa_Nombre: 'Despacho Pérez',
  });
  assert.equal(texto(out), 'Demandante: Lucía Martínez & Cía <SL>, con NIF 12345678Z.Juzgado: Juzgado de lo Social nº 3 de Palma — autos 945/23');
  assert.equal(texto(out, 'word/header1.xml'), 'Despacho Pérez');
});

test('citas del texto legal, campos sin valor y saltos de línea', () => {
  const plantilla = docx(`<w:p>${run('El llamado «deudor cautivo» y el «BOE»; dato: «WIZINK_TAE_DEL_CONTRATO»; firma: «Empresa_Dirección»')}</w:p>`);
  assert.deepEqual(camposDePlantilla(plantilla), ['WIZINK_TAE_DEL_CONTRATO', 'Empresa_Dirección']);
  // Sin valor para WIZINK: se queda el marcador visible (mejor que un hueco).
  const out = rellenarPlantilla(plantilla, { Empresa_Dirección: 'C/ Mayor 1\n07001 Palma' });
  assert.equal(texto(out), 'El llamado «deudor cautivo» y el «BOE»; dato: «WIZINK_TAE_DEL_CONTRATO»; firma: C/ Mayor 1\n07001 Palma');
});

test('el mismo campo escrito de dos formas cuenta una vez y se rellena en ambas', () => {
  const plantilla = docx(`<w:p>${run('«Datos_del_Expediente_Ref._Expediente» / «Datos_del_Expediente_Ref__Expediente»')}</w:p>`);
  assert.equal(camposDePlantilla(plantilla).length, 1);
  const out = rellenarPlantilla(plantilla, { [claveCanonica('Datos_del_Expediente_Ref._Expediente')]: 'R-77' });
  assert.equal(texto(out), 'R-77 / R-77');
});

test('campos MERGEFIELD de Word: se quita el código y queda el valor', () => {
  const campo = (nombre: string) =>
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> MERGEFIELD ${nombre} \\* MERGEFORMAT </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(`«${nombre}»`)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const plantilla = docx(`<w:p>${run('Autos ')}${campo('Juzgado_Principal_Núm_Autos')}${run(' fin')}</w:p>`);
  assert.deepEqual(camposDePlantilla(plantilla), ['Juzgado_Principal_Núm_Autos']);
  const out = rellenarPlantilla(plantilla, { Juzgado_Principal_Núm_Autos: '12/2026' });
  const xml = new AdmZip(out).readAsText('word/document.xml');
  assert.equal(texto(out), 'Autos 12/2026 fin');
  assert.ok(!/fldChar|MERGEFIELD/.test(xml), 'no debe quedar el código del campo');
});

test('datos de Vantia: grupos, nombres cortados a 40 letras y etiquetas', () => {
  assert.equal(grupoDe(claveCanonica('Contrario_Principal_Nombre')).grupo, 'Contrario');
  assert.equal(grupoDe(claveCanonica('Procurador_Contrario_Principal_Nombre')).grupo, 'Procurador contrario');
  assert.equal(grupoDe(claveCanonica('WIZINK_TAE_DEL_CONTRATO')).grupo, 'Otros');
  assert.equal(etiquetaDe('Abogado_Propio_Principal_Núm_Colegiado'), 'Núm Colegiado');
  const ctx: any = {
    org: { nombre: 'Despacho Pérez', nif: 'B12345678' }, exp: { anio: 2026, num_exp: 7, descripcion: 'Reclamación de cantidad', num_autos: '945/23', tipo_proc: 'Ordinario' },
    cliente: { nombre: 'Lucía Martínez', nif: '12345678Z' }, contrario: { nombre: 'Banco X' }, juzgado: { nombre: 'Juzgado nº 3 de Palma', poblacion: 'Palma', autos: '945/23' },
    procurador: {}, procuradorContrario: {}, abogado: { nombre: 'Ana', colegiado: '1234' }, abogadoContrario: {},
  };
  assert.equal(valorVantia('Datos_del_Expediente_Descripción_Expedie', ctx), 'Reclamación de cantidad'); // cortado por MN
  assert.equal(valorVantia('Datos_del_Expediente_Núm._Expediente', ctx), '2026/7');
  assert.equal(valorVantia('Juzgados_Población', ctx), 'Palma');
  assert.equal(valorVantia('Contrarios_Nombre', ctx), 'Banco X');
  assert.equal(valorVantia('Abogado_Propio_Principal_Núm_Colegiado', ctx), '1234');
  assert.equal(valorVantia('Empresa_NIF/CIF', ctx), 'B12345678');
  assert.equal(valorVantia('Tipos_de_Procedimiento_Tipo_Procedimient', ctx), 'Ordinario');
  assert.equal(valorVantia('WIZINK_TAE_DEL_CONTRATO', ctx), undefined);
  // "General_Expedientes_*" y "Clientes_Principal_*" son los mismos datos
  assert.equal(valorVantia('General_Expedientes_Núm._Expediente', ctx), '2026/7');
  assert.equal(valorVantia('Clientes_Principal_NIF/CIF', ctx), '12345678Z');
  assert.equal(grupoDe(claveCanonica('General_Facturas_Total_IVA/IGIC')).grupo, 'Otros');
  assert.match(valorVantia('Empresa_Fecha_Impresión_Larga', ctx) || '', /^\d{1,2} de [a-z]+ de \d{4}$/);
});

// Todas las plantillas reales del despacho: ningún marcador se queda sin
// sustituir y el XML resultante sigue siendo válido (las etiquetas cuadran).
const DOCPLANT = path.resolve(__dirname, '../DocPlant');
test('todas las plantillas .docx de DocPlant se rellenan sin romperse', { skip: !fs.existsSync(DOCPLANT) && 'sin DocPlant' }, () => {
  const files: string[] = [];
  (function w(d: string) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) files.push(p); } })(DOCPLANT);
  assert.ok(files.length > 100);
  let campos = 0;
  for (const f of files) {
    const buf = fs.readFileSync(f);
    const nombres = camposDePlantilla(buf);
    campos += nombres.length;
    const valores: Record<string, string> = {};
    nombres.forEach((n, k) => { valores[claveCanonica(n)] = `«V${k}»`.replace(/[«»]/g, '#'); });
    const out = rellenarPlantilla(buf, valores);
    const z = new AdmZip(out);
    for (const e of z.getEntries()) {
      if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(e.entryName)) continue;
      const xml = e.getData().toString('utf-8');
      for (const n of nombres) assert.ok(!xml.includes(`«${n}»`), `${path.basename(f)}: queda «${n}»`);
      // Mismo número de párrafos y de cierres que el original: no se ha roto
      // la estructura (solo cambian los textos y, con MERGEFIELD, algún run).
      const original = new AdmZip(buf).readAsText(e.entryName);
      const cuenta = (x: string, re: RegExp) => (x.match(re) || []).length;
      assert.equal(cuenta(xml, /<\/w:p>/g), cuenta(original, /<\/w:p>/g), `${path.basename(f)} ${e.entryName}: párrafos`);
      assert.equal(cuenta(xml, /<w:t[ >]/g), cuenta(xml, /<\/w:t>/g), `${path.basename(f)} ${e.entryName}: <w:t> descuadrado`);
    }
  }
  assert.ok(campos > 3000);
});
