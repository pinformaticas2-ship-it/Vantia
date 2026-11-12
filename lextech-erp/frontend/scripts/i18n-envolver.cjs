#!/usr/bin/env node
// Prepara archivos para traducirse (12/11/2026): envuelve en t("...") los
// textos visibles que encuentra en el código y añade el import de t.
//
//   node scripts/i18n-envolver.cjs src/pages/Configuracion.tsx [más archivos]
//
// Qué toca (con el compilador de TypeScript, no con expresiones regulares):
//  - Texto suelto en JSX:            <p>Hola</p>           → <p>{t("Hola")}</p>
//  - Atributos de texto:             title="Copiar"        → title={t("Copiar")}
//    (title, placeholder, aria-label, alt, label, desc, titulo, descripcion…)
//  - Avisos y errores:               aviso.ok("Guardado")  → aviso.ok(t("Guardado"))
//    (aviso, aviso.*, setError*, setXxxError, proximamente, alert)
//  - confirmar({ titulo, mensaje, confirmar, cancelar })
// Las plantillas con variables pasan a t("Hola {nombre}", { nombre }).
// Qué NO toca: listas de datos fuera del JSX (menús, opciones...): esas se
// traducen a mano donde se pintan. Ver scripts/i18n-pendientes.cjs.
const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const ATRIBUTOS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'desc', 'titulo', 'descripcion', 'description', 'subtitle', 'subtitulo', 'texto', 'text', 'tooltip', 'emptyText', 'confirmText', 'cancelText', 'hint', 'ayuda', 'etiqueta']);
const LLAMADAS = /^(aviso(\.(ok|error|info))?|proximamente|alert|window\.alert|set[A-Za-z]*Error|setError[A-Za-z]*|setAviso|setMensaje[A-Za-z]*|setToast|setStatusMsg|setInfo)$/;
const PROPS_CONFIRMAR = new Set(['titulo', 'mensaje', 'confirmar', 'cancelar']);
// Con --props: también estas propiedades de objetos.
const CON_PROPS = process.argv.includes('--props');
const PROPS_TEXTO = new Set(['desc', 'description', 'descripcion', 'title', 'subtitle', 'subtitulo', 'titulo', 'texto', 'mensaje', 'ayuda', 'placeholder', 'label', 'body', 'tooltip', 'hint', 'error', 'aviso', 'sub']);
const SIN_TRADUCIR_DENTRO = new Set(['code', 'pre', 'kbd', 'style', 'script']);
const LETRAS = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/;

const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#10': '\n', middot: '·', hellip: '…', rarr: '→', larr: '←', mdash: '—', ndash: '–', laquo: '«', raquo: '»' };
function decodificar(s) { return s.replace(/&(#?\w+);/g, (m, k) => (k in ENTIDADES ? ENTIDADES[k] : m)); }

function nombreVariable(expr, usados) {
  let base = 'v';
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  else if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) base = expr.expression.name.text;
  base = base.replace(/[^A-Za-z0-9_]/g, '') || 'v';
  let n = base, i = 2;
  while (usados.has(n)) n = `${base}${i++}`;
  usados.add(n);
  return n;
}

/** ¿Hay una variable o parámetro llamado `t` visible en ese punto? (p. ej.
 *  lista.map((t) => …)). Entonces se usa `tr`, importado como alias. */
let usaAlias = false;
function declaraT(nombre) {
  if (!nombre) return false;
  if (ts.isIdentifier(nombre)) return nombre.text === 't';
  if (ts.isObjectBindingPattern(nombre) || ts.isArrayBindingPattern(nombre)) return nombre.elements.some((e) => !ts.isOmittedExpression(e) && declaraT(e.name));
  return false;
}
function tSombreado(nodo) {
  for (let p = nodo.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p) && p.parameters?.some((par) => declaraT(par.name))) return true;
    if (ts.isCatchClause(p) && p.variableDeclaration && declaraT(p.variableDeclaration.name)) return true;
    if ((ts.isBlock(p) || ts.isSourceFile(p) || ts.isCaseClause(p) || ts.isModuleBlock(p)) && p.statements.some((st) =>
      (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => declaraT(d.name)))
      || ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name?.text === 't'))) {
      // Un "t" de módulo que es el propio import no cuenta.
      return true;
    }
    if ((ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer && ts.isVariableDeclarationList(p.initializer)
      && p.initializer.declarations.some((d) => declaraT(d.name))) return true;
  }
  return false;
}
let nodoActual = null;
function fn() {
  if (nodoActual && tSombreado(nodoActual)) { usaAlias = true; return 'tr'; }
  return 't';
}

/** "texto" o `texto ${x}` → código t(...) ; null si no tiene letras. */
function llamadaT(nodo, fuente) {
  nodoActual = nodo;
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) {
    if (!LETRAS.test(nodo.text)) return null;
    // Clases de Tailwind ("text-red-600 peligro") no son texto.
    if (/^[a-z0-9:\-\/\[\]\.#!% ]+$/.test(nodo.text) && nodo.text.includes('-')) return null;
    return `${fn()}(${JSON.stringify(nodo.text)})`;
  }
  if (ts.isTemplateExpression(nodo)) {
    const usados = new Set();
    let texto = nodo.head.text;
    const vars = [];
    for (const span of nodo.templateSpans) {
      const nombre = nombreVariable(span.expression, usados);
      vars.push(`${nombre}: ${span.expression.getText(fuente)}`);
      texto += `{${nombre}}` + span.literal.text;
    }
    if (!LETRAS.test(texto.replace(/\{[^}]+\}/g, ''))) return null;
    return `${fn()}(${JSON.stringify(texto)}, { ${vars.join(', ')} })`;
  }
  return null;
}

function dentroDeT(nodo) {
  for (let p = nodo.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['t', 'tn', 'tr'].includes(p.expression.text)) return true;
  }
  return false;
}
function etiquetaPadre(nodo) {
  for (let p = nodo.parent; p; p = p.parent) {
    if (ts.isJsxElement(p)) {
      const tag = p.openingElement.tagName.getText();
      if (SIN_TRADUCIR_DENTRO.has(tag)) return tag;
    }
  }
  return null;
}

function procesar(archivo) {
  const codigo = fs.readFileSync(archivo, 'utf8');
  const fuente = ts.createSourceFile(archivo, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const cambios = [];
  usaAlias = false;
  const visitar = (n) => {
    // Texto suelto en JSX
    if (ts.isJsxText(n) && LETRAS.test(n.text) && !etiquetaPadre(n)) {
      const raw = n.getFullText(fuente);
      const nucleo = decodificar(raw.replace(/\s+/g, ' ').trim());
      if (nucleo) {
        const antes = /^[ \t]+\S/.test(raw) || (/^[ \t]+/.test(raw) && !/^\s*\n/.test(raw)) ? '{" "}' : '';
        const despues = /\S[ \t]+$/.test(raw) && !/\n\s*$/.test(raw) ? '{" "}' : '';
        cambios.push([n.getFullStart(), n.getEnd(), `${antes}{${(nodoActual = n, fn())}(${JSON.stringify(nucleo)})}${despues}`]);
      }
    }
    // Atributos de texto
    if (ts.isJsxAttribute(n) && n.initializer && ATRIBUTOS.has(n.name.getText(fuente))) {
      const ini = n.initializer;
      if (ts.isStringLiteral(ini) && LETRAS.test(ini.text)) {
        // En un atributo JSX "&#10;" es un salto de línea (en JS ya no lo sería).
        const texto = decodificar(ini.text);
        cambios.push([ini.getStart(fuente), ini.getEnd(), `{${(nodoActual = ini, fn())}(${JSON.stringify(texto)})}`]);
      } else if (ts.isJsxExpression(ini) && ini.expression && !dentroDeT(ini.expression)) {
        const c = llamadaT(ini.expression, fuente);
        if (c) cambios.push([ini.expression.getStart(fuente), ini.expression.getEnd(), c]);
      }
    }
    // Avisos y errores (también "e?.message || 'No se pudo…'")
    // Envuelve los textos "hoja" de una expresión: a ? "x" : "y", a || "x"...
    const hojas = (e) => {
      if (!e || dentroDeT(e)) return;
      if (ts.isParenthesizedExpression(e)) return hojas(e.expression);
      if (ts.isConditionalExpression(e)) { hojas(e.whenTrue); hojas(e.whenFalse); return; }
      if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) { hojas(e.right); return; }
      const c = llamadaT(e, fuente);
      if (c) cambios.push([e.getStart(fuente), e.getEnd(), c]);
    };
    if (ts.isCallExpression(n) && LLAMADAS.test(n.expression.getText(fuente)) && n.arguments[0]) hojas(n.arguments[0]);
    // new Error("No se pudo…"): su mensaje acaba en pantalla.
    if (ts.isNewExpression(n) && n.expression.getText(fuente) === 'Error' && n.arguments?.[0]) hojas(n.arguments[0]);
    // Atributos con condición: title={x ? "a" : "b"}
    if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression
      && ATRIBUTOS.has(n.name.getText(fuente)) && !ts.isStringLiteralLike(n.initializer.expression) && !ts.isTemplateExpression(n.initializer.expression)) {
      hojas(n.initializer.expression);
    }
    // Propiedades de texto en objetos (descripciones, títulos...). "name" no:
    // a menudo es también un identificador.
    if (CON_PROPS && ts.isPropertyAssignment(n) && PROPS_TEXTO.has(n.name.getText(fuente).replace(/['"]/g, ''))) {
      hojas(n.initializer);
    }
    // confirmar({ titulo, mensaje, confirmar, cancelar })
    if (ts.isCallExpression(n) && n.expression.getText(fuente) === 'confirmar' && n.arguments[0]) {
      const a = n.arguments[0];
      if (ts.isObjectLiteralExpression(a)) {
        for (const p of a.properties) {
          if (ts.isPropertyAssignment(p) && PROPS_CONFIRMAR.has(p.name.getText(fuente)) && !dentroDeT(p.initializer)) {
            const c = llamadaT(p.initializer, fuente);
            if (c) cambios.push([p.initializer.getStart(fuente), p.initializer.getEnd(), c]);
          }
        }
      } else {
        const c = llamadaT(a, fuente);
        if (c && !dentroDeT(a)) cambios.push([a.getStart(fuente), a.getEnd(), c]);
      }
      return; // no volver a entrar en las propiedades
    }
    // Textos dentro de {cond ? "Sí" : "No"} en JSX
    if (ts.isJsxExpression(n) && n.expression && ts.isJsxElement(n.parent) || (ts.isJsxExpression(n) && n.expression && ts.isJsxFragment(n.parent))) {
      const e = n.expression;
      const literales = [];
      const recoger = (x) => {
        if (ts.isParenthesizedExpression(x)) return recoger(x.expression);
        if (ts.isConditionalExpression(x)) { recoger(x.whenTrue); recoger(x.whenFalse); return; }
        if (ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || x.operatorToken.kind === ts.SyntaxKind.BarBarToken || x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) { recoger(x.right); if (x.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) recoger(x.left); return; }
        if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateExpression(x)) literales.push(x);
      };
      if (e && !etiquetaPadre(n)) recoger(e);
      for (const l of literales) {
        if (dentroDeT(l)) continue;
        const c = llamadaT(l, fuente);
        if (c) cambios.push([l.getStart(fuente), l.getEnd(), c]);
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  if (!cambios.length) return 0;
  // Sin solapes: si dos cambios se pisan, se queda el de fuera.
  cambios.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const finales = [];
  let fin = -1;
  for (const c of cambios) { if (c[0] >= fin) { finales.push(c); fin = c[1]; } }
  let salida = codigo;
  for (const [ini, f, txt] of finales.reverse()) salida = salida.slice(0, ini) + txt + salida.slice(f);
  // import { t } (y { t as tr } si hacía falta) from '.../lib/i18n'
  const nombres = [];
  if (/(^|[^\w.])t\(/.test(salida)) nombres.push('t');
  if (usaAlias) nombres.push('t as tr');
  const rel = path.relative(path.dirname(archivo), path.join(__dirname, '..', 'src', 'lib', 'i18n')).replace(/\\/g, '/');
  const ruta = rel.startsWith('.') ? rel : `./${rel}`;
  const existente = salida.match(/import\s*\{([^}]*)\}\s*from\s*(['"][^'"]*\/i18n['"]);?/);
  if (existente) {
    const dentro = existente[1].split(',').map((x) => x.trim()).filter(Boolean);
    for (const n of nombres) if (!dentro.includes(n)) dentro.push(n);
    salida = salida.replace(existente[0], `import { ${dentro.join(', ')} } from ${existente[2]};`);
  } else if (nombres.length) {
    const imports = [...salida.matchAll(/^import[\s\S]*?;\s*$/gm)];
    const ultimo = imports.length ? imports[imports.length - 1] : null;
    const linea = `import { ${nombres.join(', ')} } from '${ruta}';\n`;
    if (ultimo) {
      const pos = ultimo.index + ultimo[0].length;
      salida = salida.slice(0, pos) + (salida[pos - 1] === '\n' ? '' : '\n') + linea + salida.slice(pos);
    } else salida = linea + salida;
  }
  fs.writeFileSync(archivo, salida);
  return finales.length;
}

let total = 0;
for (const a of process.argv.slice(2).filter((x) => !x.startsWith("--"))) {
  const n = procesar(a);
  total += n;
  console.log(`${a}: ${n} textos`);
}
console.log(`Total: ${total}`);
