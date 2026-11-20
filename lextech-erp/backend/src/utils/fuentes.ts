import crypto from 'crypto';
import { FUENTES_GOOGLE_RESPALDO } from '../data/fuentesGoogleRespaldo';

// ══════════════════════════════════════════════════════════════════════════════
// Fuentes del editor de Documentos (20/11/2026).
//  · Catálogo: Google Fonts entero (metadatos públicos de fonts.google.com, se
//    renuevan una vez al día; si no responde, la copia de data/).
//  · Al exportar a Word, las fuentes de Google que use el documento se
//    INCRUSTAN en el .docx (como «Incrustar fuentes» de Word), para que se vea
//    igual en un ordenador que no las tenga instaladas.
// A Google solo se le piden fuentes por su nombre: nunca va contenido del
// documento.
// ══════════════════════════════════════════════════════════════════════════════

export type Fuente = { n: string; c: string; v: string };

const URL_CATALOGO = 'https://fonts.google.com/metadata/fonts';
const CATEGORIAS: Record<string, string> = { 'Serif': 's', 'Sans Serif': 'n', 'Display': 'd', 'Handwriting': 'h', 'Monospace': 'm' };
const UN_DIA = 24 * 3600 * 1000;

/** Fuentes que trae Windows/Office: no se incrustan (ya están en cualquier equipo con Word). */
export const FUENTES_DE_OFFICE = new Set([
  'times new roman', 'arial', 'calibri', 'cambria', 'garamond', 'georgia', 'book antiqua', 'helvetica', 'verdana',
  'tahoma', 'courier new', 'segoe ui', 'trebuchet ms', 'century gothic', 'palatino linotype', 'consolas', 'comic sans ms',
  'impact', 'candara', 'constantia', 'corbel', 'franklin gothic medium', 'lucida console', 'lucida sans unicode',
  'arial narrow', 'arial black', 'aptos', 'bookman old style', 'century schoolbook', 'calibri light', 'cambria math',
]);

const respaldo = (): Fuente[] => FUENTES_GOOGLE_RESPALDO.split('\n').map((l) => {
  const [n, c, v] = l.split('|');
  return { n, c, v };
});

let cache: { fuentes: Fuente[]; hasta: number; origen: 'google' | 'copia' } | null = null;
let pidiendo: Promise<void> | null = null;

async function renovarCatalogo() {
  try {
    const r = await fetch(URL_CATALOGO, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(String(r.status));
    // Google a veces antepone ")]}'" al JSON.
    const j = JSON.parse((await r.text()).replace(/^\)\]\}'\s*/, ''));
    const lista: Fuente[] = (j.familyMetadataList || [])
      .filter((f: any) => f?.family && CATEGORIAS[f.category] && (f.subsets || []).includes('latin') && !f.isBrandFont)
      .sort((a: any, b: any) => (a.popularity ?? 1e9) - (b.popularity ?? 1e9))
      .map((f: any) => {
        const k = Object.keys(f.fonts || {});
        const v = (k.includes('400') ? 'r' : '') + (k.includes('700') ? 'b' : '') + (k.includes('400i') ? 'i' : '') + (k.includes('700i') ? 'x' : '');
        return { n: String(f.family), c: CATEGORIAS[f.category], v };
      });
    if (lista.length < 500) throw new Error('catálogo incompleto');
    cache = { fuentes: lista, hasta: Date.now() + UN_DIA, origen: 'google' };
  } catch {
    // Sin conexión con Google: la copia, y se reintenta en una hora.
    cache = { fuentes: cache?.fuentes || respaldo(), hasta: Date.now() + 3600 * 1000, origen: cache?.origen || 'copia' };
  }
}

export async function catalogoFuentes(): Promise<{ fuentes: Fuente[]; origen: string }> {
  if (!cache || cache.hasta < Date.now()) {
    // Una sola descarga aunque lleguen muchas peticiones a la vez.
    pidiendo ||= renovarCatalogo().finally(() => { pidiendo = null; });
    if (!cache) await pidiendo;
  }
  return { fuentes: cache!.fuentes, origen: cache!.origen };
}

// ── Descarga de los TTF ─────────────────────────────────────────────────────

const VARIANTES = [
  { clave: 'r', css: '0,400', etiqueta: 'embedRegular' },
  { clave: 'b', css: '0,700', etiqueta: 'embedBold' },
  { clave: 'i', css: '1,400', etiqueta: 'embedItalic' },
  { clave: 'x', css: '1,700', etiqueta: 'embedBoldItalic' },
] as const;
const MAX_TTF = 3 * 1024 * 1024;   // las de alfabetos asiáticos pesan demasiado
const MAX_FAMILIAS = 6;
const ttfCache = new Map<string, Buffer | null>();

async function descargarTtf(familia: string, css: string): Promise<Buffer | null> {
  const clave = `${familia}|${css}`;
  if (ttfCache.has(clave)) return ttfCache.get(clave)!;
  let ttf: Buffer | null = null;
  try {
    const q = `${encodeURIComponent(familia).replace(/%20/g, '+')}:ital,wght@${css}`;
    // Con un navegador antiguo como User-Agent, Google sirve TrueType (lo que Word incrusta) y no WOFF2.
    const hoja = await fetch(`https://fonts.googleapis.com/css2?family=${q}`, { headers: { 'User-Agent': 'Mozilla/4.0' }, signal: AbortSignal.timeout(8000) });
    if (hoja.ok) {
      const url = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/.exec(await hoja.text())?.[1];
      if (url) {
        const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const len = Number(r.headers.get('content-length') || 0);
        if (r.ok && len <= MAX_TTF) {
          const b = Buffer.from(await r.arrayBuffer());
          if (b.length <= MAX_TTF) ttf = b;
        }
      }
    }
  } catch { ttf = null; }
  if (ttfCache.size > 80) ttfCache.delete(ttfCache.keys().next().value as string);
  ttfCache.set(clave, ttf);
  return ttf;
}

/** Familias de Google usadas en el HTML (por su font-family), sin las de Office. */
export async function fuentesGoogleDelHtml(html: string): Promise<Fuente[]> {
  const usadas = new Set<string>();
  for (const m of String(html || '').matchAll(/font-family:\s*((?:&quot;[^&]*&quot;|'[^']*'|[^;"])+)/gi)) {
    const primera = m[1].split(',')[0].replace(/&quot;|['"]/g, '').trim();
    if (primera && !FUENTES_DE_OFFICE.has(primera.toLowerCase())) usadas.add(primera.toLowerCase());
  }
  if (!usadas.size) return [];
  const { fuentes } = await catalogoFuentes();
  return fuentes.filter((f) => usadas.has(f.n.toLowerCase())).slice(0, MAX_FAMILIAS);
}

/**
 * Incrusta las fuentes en el .docx (ECMA-376 §17.8.1: fuente "ofuscada" con
 * los 32 primeros bytes XOR la clave GUID, word/fonts/*.odttf, relación desde
 * fontTable.xml y <w:embedTrueTypeFonts/> en settings.xml).
 */
export async function incrustarFuentes(zip: any, fuentes: Fuente[]): Promise<string[]> {
  if (!fuentes.length) return [];
  const tabla = zip.file('word/fontTable.xml');
  if (!tabla) return [];
  let fontTable: string = await tabla.async('string');
  const relsPath = 'word/_rels/fontTable.xml.rels';
  let rels: string = zip.file(relsPath)
    ? await zip.file(relsPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let n = (rels.match(/Id="rIdF\d+"/g) || []).length;
  const incrustadas: string[] = [];

  for (const f of fuentes) {
    const embeds: string[] = [];
    for (const v of VARIANTES) {
      if (!f.v.includes(v.clave)) continue;
      const ttf = await descargarTtf(f.n, v.css);
      if (!ttf) continue;
      n += 1;
      const guid = crypto.randomUUID().toUpperCase();
      const clave = guid.replace(/-/g, '');
      // Clave: los 16 bytes del GUID leídos de derecha a izquierda.
      const k = Array.from({ length: 16 }, (_, i) => parseInt(clave.substr(30 - i * 2, 2), 16));
      const datos = Buffer.from(ttf);
      for (let i = 0; i < 32; i++) datos[i] ^= k[i % 16];
      zip.file(`word/fonts/font${n}.odttf`, datos);
      rels = rels.replace('</Relationships>', `<Relationship Id="rIdF${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font${n}.odttf"/></Relationships>`);
      embeds.push(`<w:${v.etiqueta} r:id="rIdF${n}" w:fontKey="{${guid}}"/>`);
    }
    if (!embeds.length) continue;
    incrustadas.push(f.n);
    const nombre = f.n.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const existente = new RegExp(`<w:font w:name="${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">([\\s\\S]*?)</w:font>`);
    fontTable = existente.test(fontTable)
      ? fontTable.replace(existente, (_m, dentro) => `<w:font w:name="${nombre}">${dentro}${embeds.join('')}</w:font>`)
      : fontTable.replace('</w:fonts>', `<w:font w:name="${nombre}">${embeds.join('')}</w:font></w:fonts>`);
  }
  if (!incrustadas.length) return [];

  if (!/xmlns:r=/.test(fontTable.slice(0, 600))) {
    fontTable = fontTable.replace('<w:fonts ', '<w:fonts xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  }
  zip.file('word/fontTable.xml', fontTable);
  zip.file(relsPath, rels);

  const tipos = zip.file('[Content_Types].xml');
  let ct: string = await tipos.async('string');
  if (!/Extension="odttf"/.test(ct)) {
    ct = ct.replace('<Default ', '<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/><Default ');
    zip.file('[Content_Types].xml', ct);
  }
  const ajustes = zip.file('word/settings.xml');
  if (ajustes) {
    let s: string = await ajustes.async('string');
    if (!/<w:embedTrueTypeFonts/.test(s)) {
      // Orden del esquema: …zoom, …, embedTrueTypeFonts antes de defaultTabStop.
      s = /<w:zoom\b[^>]*\/>/.test(s)
        ? s.replace(/(<w:zoom\b[^>]*\/>)/, '$1<w:embedTrueTypeFonts/>')
        : s.replace(/(<w:settings\b[^>]*>)/, '$1<w:embedTrueTypeFonts/>');
      zip.file('word/settings.xml', s);
    }
  }
  return incrustadas;
}
