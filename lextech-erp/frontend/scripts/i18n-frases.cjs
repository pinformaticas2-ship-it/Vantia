#!/usr/bin/env node
// Frases en español escritas en el código fuera de t() (variables, objetos,
// ternarios...). Revisión a ojo: no todas se ven en pantalla.
//   node scripts/i18n-frases.cjs src/pages/Agenda.tsx [...]
const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const IGNORAR_ATRIBUTOS = new Set(['className', 'key', 'id', 'type', 'name', 'href', 'to', 'src', 'role', 'value', 'accept', 'autoComplete', 'inputMode', 'target', 'rel', 'method', 'htmlFor', 'style', 'd', 'viewBox', 'fill', 'stroke', 'pattern', 'lang', 'dir', 'mode', 'variant', 'size', 'align', 'data-testid']);
const PARECE_FRASE = /([áéíóúñ¿¡]|\b(el|la|los|las|de|del|para|con|sin|por|una?|que|no|se|tu|tus|ya|al|en)\b.*\s|^[A-ZÁÉÍÓÚ][a-záéíóúñ]+( [a-záéíóúñ]+)+)/;

function revisar(archivo) {
  const fuente = ts.createSourceFile(archivo, fs.readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const dentroDeT = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['t', 'tn', 'tr'].includes(p.expression.text)) return true; return false; };
  const visitar = (n) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && !dentroDeT(n)) {
      const p = n.parent;
      const texto = ts.isTemplateExpression(n) ? n.getText(fuente).slice(1, -1) : n.text;
      const ignorar =
        ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isJsxAttribute(p) && IGNORAR_ATRIBUTOS.has(p.name.getText(fuente))) ||
        (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) && IGNORAR_ATRIBUTOS.has(p.parent.name.getText(fuente))) ||
        (ts.isCallExpression(p) && /^(console\.|fetch|apiFetch|localStorage|sessionStorage|querySelector|addEventListener|removeEventListener|require|new URL|encodeURIComponent|setAttribute|getAttribute|startsWith|endsWith|includes|split|replace|join|matchMedia|test)/.test(p.expression.getText(fuente).split('.').pop() || '')) ||
        /^[\w./:-]*$/.test(texto) || /^(bg|text|border|flex|grid|px|py|rounded|w-|h-)/.test(texto) || texto.includes('className');
      if (!ignorar && PARECE_FRASE.test(texto) && !/^\s*$/.test(texto)) {
        out.push(`${path.relative(process.cwd(), archivo)}:${fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1}  ${texto.slice(0, 110)}`);
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  return out;
}
for (const a of process.argv.slice(2)) for (const l of revisar(a)) console.log(l);
