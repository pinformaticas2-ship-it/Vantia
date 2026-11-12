#!/usr/bin/env node
// ¿Algún texto traducido con t("X") se usa también como valor en la lógica?
// (p. ej. label: t("Todos") y luego seccion === "Todos"). En inglés, esas
// comparaciones dejarían de cumplirse. Lista: archivo:línea  "X".
//   node scripts/i18n-choques.cjs src/**/*.tsx
const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

for (const archivo of process.argv.slice(2)) {
  const fuente = ts.createSourceFile(archivo, fs.readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const traducidos = new Map(); // texto -> línea del t()
  const crudos = new Map(); // texto -> líneas donde aparece sin t()
  const dentroDeT = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['t', 'tr', 'tn'].includes(p.expression.text)) return true; return false; };
  const visitar = (n) => {
    if (ts.isStringLiteralLike(n)) {
      const linea = fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      const p = n.parent;
      const esClaveObjeto = ts.isPropertyAssignment(p) && p.name === n;
      if (dentroDeT(n) && ts.isCallExpression(p) && p.arguments[0] === n) traducidos.set(n.text, linea);
      else if (!dentroDeT(n) && !esClaveObjeto && !ts.isImportDeclaration(p) && !ts.isLiteralTypeNode(p)) {
        if (!crudos.has(n.text)) crudos.set(n.text, []);
        crudos.get(n.text).push(linea);
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  for (const [txt, l] of traducidos) {
    if (crudos.has(txt)) console.log(`${path.relative(process.cwd(), archivo)}:${l}  ${JSON.stringify(txt)}  (sin traducir en: ${crudos.get(txt).slice(0, 6).join(', ')})`);
  }
}
