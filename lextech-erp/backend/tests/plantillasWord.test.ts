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

// Documentos base de cada expediente: qué plantilla toca según el asunto, y que existan.
import { plantillaPara } from '../src/services/docsBaseExpediente';
test('documentos base: plantilla según el asunto (y todas existen en DocPlant)', { skip: !fs.existsSync(DOCPLANT) && 'sin DocPlant' }, () => {
  const casos: [any, string, string][] = [
    [{ tipo: 'judicial', descripcion: 'Reclamación de cantidad' }, 'INFORME DE TOMA DE REQUISITOS.doc', 'HOJA DE ENCARGO ASUNTO CIVIL.doc'],
    [{ tipo: 'penal' }, 'INFORME DE TOMA DE REQUISITOS.doc', 'HOJA DE ENCARGO ASUNTO PENAL.doc'],
    [{ tipo: 'judicial', tipos_asunto: 'Usura', descripcion: 'Tarjeta revolving Wizink' }, 'INFORME DE TOMA DE REQUISITOS USURA-TRANSPARENCIA-ABUSIVIDAD.doc', 'HOJA DE ENCARGO TARJETA REVOLVING.docx'],
    [{ tipo: 'judicial', descripcion: 'Cláusula suelo hipoteca' }, 'INFORME TOMA DE REQUISITOS CLÁUSULAS-HIPOTECAS.doc', 'HOJA DE ENCARGO ASUNTO CIVIL.doc'],
    [{ tipo: 'extrajudicial', tipos_asunto: 'Medidas de apoyo' }, 'INFORME TOMA DE REQUISITOS MEDIDAS DE APOYO PERS. DISC..doc', 'HOJA DE ENCARGO ESPECÍFICA IFP MEDIDAS DE APOYO SIN APLAZAR.doc'],
    [{ tipo: 'obligacion_hacer' }, 'INFORME DE TOMA DE REQUISITOS.doc', 'HOJA DE ENCARGO OBLIGACIÓN DE HACER.doc'],
  ];
  for (const [exp, toma, encargo] of casos) {
    assert.equal(path.basename(plantillaPara('toma_requisitos', exp)), toma);
    assert.equal(path.basename(plantillaPara('hoja_encargo', exp)), encargo);
    for (const t of ['lopd', 'toma_requisitos', 'hoja_encargo'] as const) {
      assert.ok(fs.existsSync(path.join(DOCPLANT, plantillaPara(t, exp))), `no existe ${plantillaPara(t, exp)}`);
    }
  }
});

// Plantillas en subcarpetas y con nombres repetidos (carpeta del despacho en la nube).
import { mejorPlantilla } from '../src/services/docsBaseExpediente';
test('documentos base: con nombres repetidos en subcarpetas gana la de la carpeta que toca', { skip: !fs.existsSync(DOCPLANT) && 'sin DocPlant' }, () => {
  // Simula la carpeta de Drive del despacho: el mismo árbol, metido en otra carpeta más
  const lista: { nombre: string; carpeta: string; ext: string }[] = [];
  (function w(d: string, rel: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) w(p, rel ? `${rel}/${e.name}` : e.name);
      else if (/\.docx?$/i.test(e.name) && !e.name.startsWith('~$')) lista.push({ nombre: e.name, carpeta: `Despacho/Plantillas${rel ? '/' + rel : ''}`, ext: path.extname(e.name).toLowerCase() });
    }
  })(DOCPLANT, '');
  const civil = { tipo: 'judicial', descripcion: 'Reclamación de cantidad' };
  const lopd = mejorPlantilla(lista, 'lopd', plantillaPara('lopd', civil))!;
  assert.equal(`${lopd.carpeta}/${lopd.nombre}`, 'Despacho/Plantillas/Clientes/Clientes/Documento LOPD.docx'); // no la de Trabajadores
  const penal = mejorPlantilla(lista, 'hoja_encargo', plantillaPara('hoja_encargo', { tipo: 'penal' }))!;
  assert.equal(`${penal.carpeta}/${penal.nombre}`, 'Despacho/Plantillas/Facturas/Proformas/Expedientes/HOJA DE ENCARGO ASUNTO PENAL.doc');
  const usura = mejorPlantilla(lista, 'toma_requisitos', plantillaPara('toma_requisitos', { tipo: 'judicial', tipos_asunto: 'Usura' }))!;
  assert.equal(usura.nombre, 'INFORME DE TOMA DE REQUISITOS USURA-TRANSPARENCIA-ABUSIVIDAD.doc');
  // Si el despacho renombró su hoja de encargo, se encuentra igualmente por palabras
  const renombrada = [{ nombre: 'Hoja de encargo - civil (2026).docx', carpeta: 'Plantillas/Expedientes/Nuevas', ext: '.docx' }, { nombre: 'Otra cosa.docx', carpeta: 'Plantillas', ext: '.docx' }];
  assert.equal(mejorPlantilla(renombrada, 'hoja_encargo', plantillaPara('hoja_encargo', civil))?.nombre, 'Hoja de encargo - civil (2026).docx');
  assert.equal(mejorPlantilla(renombrada, 'lopd', plantillaPara('lopd', civil)), null);
});

// ── Logo del despacho como imagen ───────────────────────────────────────────
import { partirDireccion } from '../src/services/plantillasDatos';
import zlib from 'zlib';
function pngDePrueba(w: number, h: number): Buffer {
  const crc = (buf: Buffer) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const filas = Buffer.alloc((w * 3 + 1) * h);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(filas)), chunk('IEND', Buffer.alloc(0))]);
}

test('el logo se inserta como imagen (cabecera), sin deformar y con su relación', () => {
  const plantilla = docx(`<w:p>${run('Cuerpo')}</w:p>`, `<w:p>${run('«Empresa_Logo_')}${run('de_Empresa»', true)}${run(' Despacho')}</w:p>`);
  const out = rellenarPlantilla(plantilla, {}, { Empresa_Logo_de_Empresa: { buffer: pngDePrueba(400, 100), mime: 'image/png' } });
  const z = new AdmZip(out);
  const cab = z.readAsText('word/header1.xml');
  assert.ok(/<w:drawing>/.test(cab) && !cab.includes('Empresa_Logo'), 'dibujo en lugar del marcador');
  const ext = cab.match(/<wp:extent cx="(\d+)" cy="(\d+)"/)!;
  assert.equal(Number(ext[1]) / Number(ext[2]), 4, 'mantiene la proporción 4:1');
  assert.ok(Number(ext[1]) <= 5 * 360000, 'como mucho 5 cm de ancho');
  const rels = z.readAsText('word/_rels/header1.xml.rels');
  const rid = cab.match(/r:embed="([^"]+)"/)![1];
  assert.ok(rels.includes(`Id="${rid}"`) && /Target="media\/vantia_img1\.png"/.test(rels));
  assert.ok(z.getEntry('word/media/vantia_img1.png'));
  assert.ok(/Extension="png"/.test(z.readAsText('[Content_Types].xml')));
  assert.equal(texto(out, 'word/header1.xml'), ' Despacho');
});

test('dirección del despacho en distintos formatos', () => {
  assert.deepEqual(partirDireccion('Avda. Duque de Tamames, 20 - Planta 9 Izq. - ORIHUELA (Alicante) - 03300'),
    { direccion: 'Avda. Duque de Tamames, 20, Planta 9 Izq.', cp: '03300', poblacion: 'Orihuela', provincia: 'Alicante' });
  assert.deepEqual(partirDireccion('Avda. Jaume III 18, 07012 Palma (Illes Balears)'),
    { direccion: 'Avda. Jaume III 18', cp: '07012', poblacion: 'Palma', provincia: 'Illes Balears' });
  assert.deepEqual(partirDireccion('C/ Mayor 1, 28013 Madrid'), { direccion: 'C/ Mayor 1', cp: '28013', poblacion: 'Madrid', provincia: '' });
});

// Todas las plantillas reales, con TODOS los campos rellenos y el logo: el
// resultado tiene que ser XML válido de verdad (lo comprueba Python/lxml).
test('todas las plantillas .docx + logo: Word válido (XML estricto)', { skip: (!fs.existsSync(DOCPLANT) && 'sin DocPlant') || (() => { try { require('child_process').execFileSync('python', ['-c', 'import lxml']); return false; } catch { return 'sin python/lxml'; } })() }, () => {
  const os = require('os'); const cp = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vantia-tpl-'));
  const files: string[] = [];
  (function w(d: string) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) files.push(p); } })(DOCPLANT);
  const logo = { buffer: pngDePrueba(300, 120), mime: 'image/png' };
  let conLogo = 0;
  files.forEach((f, i) => {
    const buf = fs.readFileSync(f);
    const valores: Record<string, string> = {};
    const imgs: Record<string, any> = {};
    for (const n of camposDePlantilla(buf)) {
      if (/LOGO/.test(claveCanonica(n))) imgs[claveCanonica(n)] = logo;
      else valores[claveCanonica(n)] = 'Línea 1 & <dato>\nLínea 2';
    }
    const out = rellenarPlantilla(buf, valores, imgs);
    if (Object.keys(imgs).length) { conLogo++; assert.ok(new AdmZip(out).getEntries().some((e) => e.entryName.startsWith('word/media/vantia_img')), `${path.basename(f)}: sin logo`); }
    fs.writeFileSync(path.join(dir, `${i}.docx`), out);
  });
  const py = `import zipfile,glob,sys\nfrom lxml import etree\nmal=[]\nfor f in glob.glob(sys.argv[1]+'/*.docx'):\n  z=zipfile.ZipFile(f)\n  for n in z.namelist():\n    if n.endswith('.xml') or n.endswith('.rels'):\n      try: etree.fromstring(z.read(n))\n      except Exception as e: mal.append(f+' '+n+' '+str(e))\nprint(len(mal)); print(chr(10).join(mal[:5]))`;
  const r = cp.execFileSync('python', ['-c', py, dir]).toString().trim().split('\n');
  assert.equal(r[0], '0', `XML roto:\n${r.slice(1).join('\n')}`);
  assert.ok(conLogo > 30, `plantillas con logo: ${conLogo}`);
  fs.rmSync(dir, { recursive: true, force: true });
});
