// Monta frontend/public/herramientas/costas.html a partir del artifact original:
// solo lo que escribió su autor (título, fuentes, estilos, contenido y su script),
// sin el entorno de claude.ai, más un puente para la IA y las descargas en Vantia.
const fs = require('fs');
const [, , ORIGEN, DESTINO] = process.argv;
const h = fs.readFileSync(ORIGEN, 'utf8');

const ini = h.indexOf('<title>');
const finCabecera = h.indexOf('</style>', h.indexOf('<style>', h.indexOf('fonts.googleapis.com/css2'))) + '</style>'.length;
const iniScripts = h.indexOf('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js');
const fin = h.lastIndexOf('</script>') + '</script>'.length;
if (ini < 0 || finCabecera < ini || iniScripts < finCabecera || fin < iniScripts) throw new Error('estructura inesperada');

const cabecera = h.slice(ini, finCabecera);          // <title>, fuentes y estilos
// (el contenido de la página va en cuerpoLetrado, más abajo)
let scripts = h.slice(iniScripts, fin);
function sustituirUna(txt, desde, hacia) { const n = txt.split(desde).length - 1; if (n !== 1) throw new Error(`«${desde.slice(0, 40)}» aparece ${n} veces`); return txt.replace(desde, hacia); }                // CDN + script de la calculadora
// En Vantia la IA es Gemini (vía nuestro backend), no Claude: textos visibles.
// Con datos del expediente (window.__vantiaExpCampos), leer la resolución no
// vacía lo que la resolución no menciona (NIG, partes contrarias, procurador) ni
// cambia la cuantía del expediente por el importe de la condena.
const VX = '(window.__vantiaExpCampos||{})';
scripts = sustituirUna(scripts, 'if(want("nig")) setField("nig", g.nig||"");',
  'if(want("nig") && (g.nig || !' + VX + '.nig)) setField("nig", g.nig||"");');
scripts = sustituirUna(scripts, 'else if(!g.cuantia_indeterminada && coN!=null && coN>0){',
  'else if(!g.cuantia_indeterminada && coN!=null && coN>0 && !' + VX + '.cuant){');
scripts = sustituirUna(scripts, '    setField("indet", !!g.cuantia_indeterminada);',
  '    if(g.cuantia_indeterminada || !' + VX + '.indet) setField("indet", !!g.cuantia_indeterminada);');
scripts = sustituirUna(scripts, 'if(want("procurador_condenada")) setField(',
  'if(want("procurador_condenada") && (has(g.procurador_condenada) || !' + VX + '.contraProc)) setField(');
scripts = sustituirUna(scripts, 'if(want("letrado_condenada")) setField(',
  'if(want("letrado_condenada") && (has(g.letrado_condenada) || !' + VX + '.contraLetr)) setField(');
scripts = sustituirUna(scripts, 'else extNotes.pr="No se ha identificado al procurador/a',
  'else if(!' + VX + '.procNom) extNotes.pr="No se ha identificado al procurador/a');

// El script de la calculadora va dentro de un (function(){ … })(): el puente de
// Vantia solo puede usar lo que se expone aquí, junto a su propio window.__calc.
scripts = sustituirUna(scripts, 'restore(); render();\nwindow.__calc = {',
  'restore(); render();\nwindow.__vantiaInterno = {setField, setMode, render, resStatus, colFromText, colegioProcDe, ponerResolucion: f=>{ resFileObj=f; }};\nwindow.__calc = {');
scripts = scripts.replace(/Claude \(IA\)/g, 'IA').replace(/a Claude/g, 'a la IA').replace(/usar Claude/g, 'usar la IA').replace(/Claude no respondió/g, 'La IA no respondió')
  .replace(/Claude está/g, 'La IA está').replace(/"Claude /g, '"La IA ');
if (/Claude/.test(scripts)) throw new Error('Quedan menciones a Claude: ' + (scripts.match(/.{30}Claude.{30}/g) || []).join(' | '));

// Datos del letrado: en el original iban fijos (los de su autor). En Vantia
// salen de las preferencias de quien usa la calculadora (LET()).
const NOMBRE_FIJO_MAY = 'FRANCISCO JAVIER FERRÁNDEZ PINA';
const NOMBRE_FIJO = 'Francisco Javier Ferrández Pina';
const COLEGIO_FIJO = ', colegiado nº 1.054 del Ilustre Colegio de Abogados de Orihuela (Alicante)';
const sustituir = (txt, desde, hacia, n) => {
  const veces = txt.split(desde).length - 1;
  if (veces !== n) throw new Error(`«${desde.slice(0, 50)}» aparece ${veces} veces (esperaba ${n})`);
  return txt.split(desde).join(hacia);
};
scripts = sustituir(scripts, `"Letrado: ${NOMBRE_FIJO_MAY}${COLEGIO_FIJO}."`, `"Letrado: "+LET().linea+"."`, 1);
scripts = sustituir(scripts, `"1. HONORARIOS DE LETRADO — ${NOMBRE_FIJO_MAY}${COLEGIO_FIJO}"`, `"1. HONORARIOS DE LETRADO — "+LET().linea`, 1);
scripts = sustituir(scripts, `"Letrado: ${NOMBRE_FIJO_MAY}${COLEGIO_FIJO}. Criterios aplicados: "`, `"Letrado: "+LET().linea+". Criterios aplicados: "`, 1);
scripts = sustituir(scripts, `", y defendida por el letrado ${NOMBRE_FIJO}"`, `", y defendida por el letrado "+LET().nombre`, 1);
scripts = sustituir(scripts, `"Fdo.: ${NOMBRE_FIJO}"`, `"Fdo.: "+LET().nombre`, 1);
scripts = sustituir(scripts, `creator:"${NOMBRE_FIJO}"`, `creator:LET().nombre`, 2);
scripts = sustituir(scripts, `P("Abogado · Colegiado nº 1.054 ICA Orihuela",`, `P("Abogado"+(LET().corta?" · "+LET().corta:""),`, 1);
if (/Ferr[aá]ndez|1\.054/i.test(scripts)) throw new Error('Quedan datos fijos del letrado en el script');
let cuerpoLetrado = h.slice(finCabecera, iniScripts);
cuerpoLetrado = sustituir(cuerpoLetrado,
  `<div class="who">${NOMBRE_FIJO_MAY}<br>Colegiado nº 1.054 · Ilustre Colegio de Abogados de Orihuela (Alicante)</div>`,
  `<div class="who" id="vantiaWho"></div>`, 1);
if (/Ferr[aá]ndez|1\.054/i.test(cuerpoLetrado)) throw new Error('Quedan datos fijos del letrado en la página');

const puente = `<script>
/* Vantia: lo que en claude.ai daba el entorno del artifact.
   - downloads.save: descarga normal del navegador.
   - sample.json: IA (Gemini) a través del backend de Vantia, con la sesión de
     la página que contiene esta calculadora (window.parent.__vantiaIA). */
(function () {
  function aBase64(blob) {
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = ko; r.readAsDataURL(blob); });
  }
  function error(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function api() { try { return window.parent && window.parent !== window ? window.parent.__vantiaIA : null; } catch (e) { return null; } }
  var downloads = {
    save: async function (o) {
      var blob = o && o.data instanceof Blob ? o.data : new Blob([o && o.data]);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = (o && o.filename) || 'documento';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      // Si la calculadora está vinculada a un expediente, Vantia ofrece guardarlo allí.
      try { if (window.parent && window.parent !== window && window.parent.__vantiaDocGenerado) window.parent.__vantiaDocGenerado(blob, (o && o.filename) || 'documento'); } catch (e) {}
      return { ok: true };
    },
  };
  var sample = {
    limits: async function () { return { images: { maxCount: 8 } }; },
    json: async function (prompt, opts) {
      opts = opts || {};
      var fn = api();
      if (!fn) throw error('capability_disabled');
      if (opts.signal && opts.signal.aborted) throw error('cancelled');
      var imagenes = [];
      for (var i = 0; i < (opts.images || []).length && imagenes.length < 8; i++) {
        var im = opts.images[i];
        if (im instanceof Blob) imagenes.push({ mime: im.type || 'image/jpeg', base64: await aBase64(im) });
      }
      var p = fn(prompt, imagenes);
      if (!opts.signal) return p;
      return Promise.race([p, new Promise(function (_, ko) { opts.signal.addEventListener('abort', function () { ko(error('cancelled')); }, { once: true }); })]);
    },
  };
  window.claude = {
    use: async function (nombre) {
      if (nombre === 'downloads') return downloads;
      if (nombre === 'sample') { if (!api()) throw error('capability_disabled'); return sample; }
      throw error('not_declared');
    },
  };
})();

/* Vantia: datos del letrado que firma (Ajustes → Mi perfil → Datos de letrado),
   que da la página que contiene la calculadora (window.parent.__vantiaLetrado). */
function LET() {
  var d = {};
  try { d = (window.parent && window.parent.__vantiaLetrado) || {}; } catch (e) { d = {}; }
  var nombre = String(d.nombre || '').trim() || '[Nombre del letrado]';
  var col = String(d.colegiado || '').trim();
  var cg = String(d.colegio || '').trim();
  return {
    nombre: nombre,
    linea: nombre.toUpperCase() + (col ? ', colegiado nº ' + col : '') + (cg ? (col ? ' del ' : ', ') + cg : ''),
    corta: (col ? 'Colegiado nº ' + col : '') + (col && cg ? ' · ' : '') + cg,
  };
}
function vantiaPintarLetrado() {
  var el = document.getElementById('vantiaWho'); if (!el) return;
  var l = LET(); el.textContent = '';
  el.appendChild(document.createTextNode(l.nombre.toUpperCase()));
  if (l.corta) { el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(l.corta)); }
}
/* La página de Vantia lo llama cuando el usuario cambia sus datos. */
window.__vantiaLetradoCambio = function () { vantiaPintarLetrado(); try { var I = window.__vantiaInterno; if (I) I.render(); } catch (e) {} };
document.addEventListener('DOMContentLoaded', vantiaPintarLetrado);

/* Vantia: abrir la calculadora desde un expediente o la ficha de un cliente.
   La página que la contiene pasa los datos que ya tiene el ERP; aquí se
   empieza una tasación en blanco y se rellenan esos campos (los que no
   vienen quedan vacíos, no con los valores de ejemplo). */
var VANTIA_VACIOS = ['juz', 'autos', 'nig', 'nref', 'resol', 'cliente', 'contra', 'contraProc', 'contraLetr', 'procNom', 'procCol', 'procIban'];
function vantiaAplicarExpediente(d) {
  var I = window.__vantiaInterno; if (!I) return;
  var b = document.getElementById('nuevaTas');
  if (b) { b.click(); b.click(); } // «+ Nueva tasación» confirmada: formulario en blanco
  var f = Object.assign({}, d.campos || {});
  VANTIA_VACIOS.forEach(function (k) { if (!(k in f)) f[k] = ''; });
  if (!('cuant' in f)) f.cuant = '';
  if (!f.col) f.col = I.colFromText(String(f.juz || '') + ' ' + String(d.localidad || '')) || '';
  if (f.procNom && !f.procCol) f.procCol = I.colegioProcDe(f.juz) || '';
  Object.keys(f).forEach(function (k) {
    var el = document.getElementById(k); if (!el) return;
    if (k === 'col' && (!f.col || !Array.prototype.some.call(el.options, function (o) { return o.value === f.col; }))) return;
    if (k === 'proc' && !f.proc) return;
    I.setField(k, f[k]);
  });
  if (d.modo === 'jura' || d.modo === 'tas') I.setMode(d.modo, true);
  I.render();
  if (d.aviso) I.resStatus(d.aviso);
  vantiaRecordarExp(f);
}
function vantiaRecordarExp(f) {
  var v = {}; ['nig', 'cuant', 'indet', 'contraProc', 'contraLetr', 'procNom'].forEach(function (k) { if (f[k]) v[k] = f[k]; });
  window.__vantiaExpCampos = Object.keys(v).length ? v : null;
  try { if (window.__vantiaExpCampos) localStorage.setItem('vantia.costas.exp', JSON.stringify(v)); else localStorage.removeItem('vantia.costas.exp'); } catch (e) {}
}
try { window.__vantiaExpCampos = JSON.parse(localStorage.getItem('vantia.costas.exp') || 'null'); } catch (e) {}
window.__vantiaCargarExpediente = function (d) {
  if (!d) return;
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function () { vantiaAplicarExpediente(d); }); return; }
  vantiaAplicarExpediente(d);
};
/* Usar un documento del expediente (sentencia, auto, decreto…) como resolución. */
window.__vantiaUsarResolucion = function (archivo, leer) {
  var I = window.__vantiaInterno; if (!I) return;
  I.ponerResolucion(archivo); document.getElementById('resName').textContent = archivo.name;
  document.getElementById('resText').value = '';
  var box = document.getElementById('resBox'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (leer) document.getElementById('resGo').click();
};
document.addEventListener('DOMContentLoaded', function () {
  // «+ Nueva tasación» confirmada a mano: ya no hay datos de expediente que proteger.
  var nt = document.getElementById('nuevaTas');
  if (nt) nt.addEventListener('click', function () { if (nt.textContent.indexOf('¿') < 0) vantiaRecordarExp({}); });
  var p = null; try { p = window.parent && window.parent !== window ? window.parent.__vantiaExpedientePendiente : null; } catch (e) {}
  if (p) { try { window.parent.__vantiaExpedientePendiente = null; } catch (e) {} setTimeout(function () { vantiaAplicarExpediente(p); }, 0); }
});
</script>
`;

const base = '<style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style>';
const html = `<!doctype html>
<!-- Calculadora de tasación de costas y jura de cuentas.
     Copiada del artifact https://claude.ai/artifact/MsQ2R8nHLWMaWTUVrMn6UM (06/11/2026)
     sin cambios en su lógica; ver lextech-erp/frontend/src/pages/Calculadora.tsx. -->
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${base}
${cabecera}
</head>
<body>
${cuerpoLetrado}
${puente}
${scripts}
</body>
</html>
`;
fs.mkdirSync(require('path').dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, html);
console.log('ok', html.length, 'bytes');
