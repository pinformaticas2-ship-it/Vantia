#!/usr/bin/env node
// ¿Qué queda por traducir al inglés? (12/11/2026)
//
//   node scripts/i18n-pendientes.cjs                 → resumen por archivo
//   node scripts/i18n-pendientes.cjs --faltan        → frases t("...") sin traducción (JSON listo para rellenar)
//   node scripts/i18n-pendientes.cjs --sueltos src/pages/Agenda.tsx → textos aún sin envolver en t()
//   node scripts/i18n-pendientes.cjs --sobran        → traducciones que ya no se usan
//
// Las traducciones están en src/i18n/en/*.ts como registrarEn({ "es": "en", ... }).
const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const SRC = path.join(__dirname, '..', 'src');
const DIC = path.join(SRC, 'i18n', 'en');
const LETRAS = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/;

function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (p !== path.join(SRC, 'i18n')) out.push(...archivos(p)); }
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function diccionario() {
  const dic = new Map();
  for (const f of fs.readdirSync(DIC).filter((x) => x.endsWith('.ts') && x !== 'index.ts')) {
    const fuente = ts.createSourceFile(f, fs.readFileSync(path.join(DIC, f), 'utf8'), ts.ScriptTarget.Latest, true);
    const visitar = (n) => {
      if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name) || ts.isIdentifier(n.name)) && ts.isStringLiteralLike(n.initializer)) {
        dic.set(ts.isStringLiteral(n.name) ? n.name.text : n.name.text, { en: n.initializer.text, archivo: f });
      }
      ts.forEachChild(n, visitar);
    };
    visitar(fuente);
  }
  return dic;
}

/** Claves usadas: primer argumento literal de t()/tn() (y segundo de tn). */
function clavesUsadas(archivo) {
  const fuente = ts.createSourceFile(archivo, fs.readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const claves = [];
  const visitar = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const nombre = n.expression.text;
      if ((nombre === 't' || nombre === 'tr') && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) claves.push(n.arguments[0].text);
      if (nombre === 'tn') for (const a of n.arguments.slice(1, 3)) if (ts.isStringLiteralLike(a)) claves.push(a.text);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  return claves;
}

/** Textos de JSX sin envolver (texto suelto y atributos de texto). */
function sueltos(archivo) {
  const fuente = ts.createSourceFile(archivo, fs.readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const ATR = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label']);
  const dentroDe = (n, tags) => { for (let p = n.parent; p; p = p.parent) if (ts.isJsxElement(p) && tags.includes(p.openingElement.tagName.getText())) return true; return false; };
  const visitar = (n) => {
    if (ts.isJsxText(n) && LETRAS.test(n.text) && !dentroDe(n, ['code', 'pre', 'kbd', 'style'])) {
      out.push([fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1, n.text.replace(/\s+/g, ' ').trim()]);
    }
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && ATR.has(n.name.getText()) && LETRAS.test(n.initializer.text)) {
      out.push([fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1, `${n.name.getText()}="${n.initializer.text}"`]);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  return out;
}

const args = process.argv.slice(2);
const dic = diccionario();
if (args[0] === '--sueltos') {
  for (const a of args.slice(1)) for (const [l, txt] of sueltos(a)) console.log(`${path.relative(process.cwd(), a)}:${l}  ${txt}`);
  process.exit(0);
}
const usados = new Map();
for (const a of archivos(SRC)) for (const k of clavesUsadas(a)) { if (!usados.has(k)) usados.set(k, new Set()); usados.get(k).add(path.relative(SRC, a).replace(/\\/g, '/')); }
if (args[0] === '--faltan') {
  const faltan = {};
  for (const [k] of usados) if (!dic.has(k)) faltan[k] = '';
  console.log(JSON.stringify(faltan, null, 2));
  process.exit(0);
}
if (args[0] === '--sobran') {
  for (const [k, v] of dic) if (!usados.has(k)) console.log(`${v.archivo}: ${JSON.stringify(k)}`);
  process.exit(0);
}
// Resumen
const porArchivo = new Map();
for (const a of archivos(SRC)) {
  const rel = path.relative(SRC, a).replace(/\\/g, '/');
  const claves = [...new Set(clavesUsadas(a))];
  const faltan = claves.filter((k) => !dic.has(k)).length;
  const s = sueltos(a).length;
  if (claves.length || s) porArchivo.set(rel, { claves: claves.length, faltan, sueltos: s });
}
let tot = { claves: 0, faltan: 0, sueltos: 0 };
const filas = [...porArchivo.entries()].sort((a, b) => (b[1].faltan + b[1].sueltos) - (a[1].faltan + a[1].sueltos));
for (const [f, r] of filas) {
  tot.claves += r.claves; tot.faltan += r.faltan; tot.sueltos += r.sueltos;
  console.log(`${(r.faltan + r.sueltos) ? '✗' : '✓'} ${f.padEnd(52)} frases ${String(r.claves).padStart(4)} · sin traducir ${String(r.faltan).padStart(4)} · sin envolver ${String(r.sueltos).padStart(4)}`);
}
console.log(`\nTotal: ${tot.claves} frases, ${tot.faltan} sin traducir, ${tot.sueltos} textos sin envolver. Diccionario: ${dic.size} entradas.`);
