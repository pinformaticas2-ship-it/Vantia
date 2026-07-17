import { Request, Response } from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';

const BOE_API_BASE = 'https://www.boe.es/datosabiertos/api';
const BOE_DOCS_URL = 'https://www.boe.es/datosabiertos/api/api.php';
const BOE_SEARCH_URL = 'https://www.boe.es/buscar/';
const CENDOJ_PORTAL_URL = 'https://www.poderjudicial.es/search/indexAN.jsp';
const CENDOJ_INFO_URL = 'https://www.poderjudicial.es/cgpj/es/Servicios/Jurisprudencia/Buscador-Fondo-Documental-Jurisprudencia/?perfil=1';
const LEXNET_SERVICE_URL = 'https://sedejudicial.justicia.es/-/lexnet';
const BOE_SCHEMA_DIR = path.resolve(__dirname, '../../resources/boe');

function ok(res: Response, data: any) {
  return res.json({ success: true, data });
}

function err(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, error: message });
}

function remoteGetText(url: string): Promise<string> {
  return remoteGet(url, 'application/xml,text/xml,text/html;q=0.9,*/*;q=0.8');
}

function remoteGet(url: string, accept: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Vantia-Documental/1.0',
          Accept: accept,
        },
      },
      (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Respuesta remota ${res.statusCode || 500}`));
          res.resume();
          return;
        }

        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve(raw));
      },
    );

    req.on('error', reject);
    req.end();
  });
}

function decodeXml(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function extractFirstTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : null;
}

function extractAllTagValues(xml: string, tag: string): string[] {
  const matches = [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi'))];
  return matches.map((match) => decodeXml(match[1])).filter(Boolean);
}

function extractBoeBlocks(xml: string) {
  const blocks = [...xml.matchAll(/<bloque>([\s\S]*?)<\/bloque>/gi)];
  return blocks.map((match) => {
    const blockXml = match[1];
    return {
      id: extractFirstTag(blockXml, 'id'),
      titulo: extractFirstTag(blockXml, 'titulo'),
      fecha_actualizacion: extractFirstTag(blockXml, 'fecha_actualizacion'),
      url: extractFirstTag(blockXml, 'url'),
    };
  }).filter((item) => item.id || item.titulo);
}

function stripHtmlTags(text: string) {
  return decodeXml(text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function extractBoeBlockContent(xml: string) {
  const bloqueMatch = xml.match(/<bloque\b([^>]*)>([\s\S]*?)<\/bloque>/i);
  if (!bloqueMatch) return null;

  const attrs = bloqueMatch[1];
  const body = bloqueMatch[2];
  const versionMatch = body.match(/<version\b([^>]*)>([\s\S]*?)<\/version>/i);
  const versionAttrs = versionMatch?.[1] || '';
  const versionBody = versionMatch?.[2] || '';
  const paragraphs = [...versionBody.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtmlTags(match[1]))
    .filter(Boolean);
  const quotes = [...versionBody.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi)]
    .map((match) => {
      const quoteParagraphs = [...match[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((p) => stripHtmlTags(p[1]))
        .filter(Boolean);
      return quoteParagraphs.join('\n');
    })
    .filter(Boolean);

  const attr = (name: string, source: string) => {
    const match = source.match(new RegExp(`${name}="([^"]*)"`, 'i'));
    return match ? decodeXml(match[1]) : null;
  };

  return {
    id: attr('id', attrs),
    tipo: attr('tipo', attrs),
    titulo: attr('titulo', attrs),
    idNorma: attr('id_norma', versionAttrs),
    fechaPublicacion: attr('fecha_publicacion', versionAttrs),
    fechaVigencia: attr('fecha_vigencia', versionAttrs),
    paragraphs,
    quotes,
    rawXml: xml,
  };
}

function getLocalBoeSchemaSummary() {
  const files = ['sumario-boe.xsd', 'tipos.xsd']
    .map((name) => {
      const fullPath = path.join(BOE_SCHEMA_DIR, name);
      if (!fs.existsSync(fullPath)) return null;
      const content = fs.readFileSync(fullPath, 'utf8');
      const elementNames = [...content.matchAll(/<xs:element\s+name="([^"]+)"/g)].map((match) => match[1]);
      const typeNames = [...content.matchAll(/<xs:(?:complexType|simpleType)\s+name="([^"]+)"/g)].map((match) => match[1]);

      return {
        name,
        size: Buffer.byteLength(content, 'utf8'),
        path: fullPath,
        topElements: [...new Set(elementNames)].slice(0, 20),
        topTypes: [...new Set(typeNames)].slice(0, 20),
      };
    })
    .filter(Boolean);

  return {
    available: files.length > 0,
    files,
  };
}

function normalizeBoeSearchTerm(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function escapeBoeQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function optionalParam(value: unknown) {
  const normalized = normalizeBoeSearchTerm(String(value || ''));
  return normalized || null;
}

function buildBoeQueryString(parts: Array<string | null>) {
  return parts.filter(Boolean).join(' and ');
}

function normalizeSearchableText(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchText(value: string | null | undefined) {
  return normalizeSearchableText(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

function scoreBoeItem(
  item: any,
  filters: {
    q: string | null;
    title: string | null;
    texto: string | null;
    rango: string | null;
    departamento: string | null;
    materia: string | null;
  },
) {
  const titleText = normalizeSearchableText(item.titulo);
  const numero = normalizeSearchableText(item.numero_oficial);
  const rango = normalizeSearchableText(item.rango?.texto || item.rango);
  const departamento = normalizeSearchableText(item.departamento?.texto || item.departamento);
  const materias = normalizeSearchableText(
    Array.isArray(item.materias)
      ? item.materias.map((entry: any) => entry?.texto || entry).join(' ')
      : item.materias,
  );
  const query = normalizeSearchableText(filters.q);
  const tokens = tokenizeSearchText(filters.q);

  let score = 0;

  if (query) {
    if (numero === query) score += 200;
    if (titleText === query) score += 180;
    if (titleText.startsWith(query)) score += 120;
    if (titleText.includes(query)) score += 90;
    if (numero.includes(query)) score += 110;
    if (materias.includes(query)) score += 40;
    if (departamento.includes(query)) score += 20;
    score += tokens.filter((token) => titleText.includes(token)).length * 18;
    score += tokens.filter((token) => materias.includes(token)).length * 8;
  }

  if (filters.title) {
    const exactTitle = normalizeSearchableText(filters.title);
    if (titleText === exactTitle) score += 120;
    if (titleText.includes(exactTitle)) score += 60;
  }

  if (filters.rango && rango.includes(normalizeSearchableText(filters.rango))) score += 25;
  if (filters.departamento && departamento.includes(normalizeSearchableText(filters.departamento))) score += 25;
  if (filters.materia && materias.includes(normalizeSearchableText(filters.materia))) score += 25;
  if (filters.texto) score += 5;

  return score;
}

function dedupeAndRankBoeItems(items: any[], filters: Parameters<typeof scoreBoeItem>[1]) {
  const seen = new Set<string>();

  return items
    .map((item) => ({
      raw: item,
      score: scoreBoeItem(item, filters),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.raw?.fecha_publicacion || '').localeCompare(String(a.raw?.fecha_publicacion || ''));
    })
    .filter(({ raw }) => {
      const key = String(raw?.identificador || raw?.numero_oficial || raw?.titulo || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ raw }) => raw);
}

export async function getDocumentalProviders(_req: Request, res: Response) {
  const boeSchema = getLocalBoeSchemaSummary();
  return ok(res, {
    boe: {
      key: 'boe',
      name: 'BOE',
      status: 'available',
      mode: 'api_publica',
      docsUrl: BOE_DOCS_URL,
      searchUrl: BOE_SEARCH_URL,
      supports: ['lookup_por_id', 'metadatos', 'estructura_de_texto', 'enlaces_oficiales', 'xsd_local_oficial'],
      note: 'Conectado con la API oficial de datos abiertos del BOE y alineado con los XSD oficiales cargados localmente.',
      localSchemaAvailable: boeSchema.available,
    },
    cendoj: {
      key: 'cendoj',
      name: 'CENDOJ',
      status: 'link_only',
      mode: 'enlace_directo',
      docsUrl: CENDOJ_INFO_URL,
      searchUrl: CENDOJ_PORTAL_URL,
      supports: ['enlaces_oficiales'],
      note: 'El portal público de CENDOJ bloquea las consultas automatizadas (403), así que solo enlazamos directamente al buscador oficial en vez de intentar leerlo desde el servidor.',
    },
    lexnet: {
      key: 'lexnet',
      name: 'LexNET',
      status: process.env.LEXNET_CLIENT_CERT_PATH || process.env.LEXNET_CLIENT_CERT_BASE64 ? 'prepared' : 'pending_credentials',
      mode: 'servicio_autenticado',
      docsUrl: LEXNET_SERVICE_URL,
      searchUrl: LEXNET_SERVICE_URL,
      supports: ['acceso_oficial', 'estado_de_integracion'],
      requiresCertificate: true,
      configured: Boolean(process.env.LEXNET_CLIENT_CERT_PATH || process.env.LEXNET_CLIENT_CERT_BASE64),
      note: 'LexNET requiere acceso autenticado con certificado válido. La integración técnica queda preparada, pero no puede quedar operativa sin credenciales y flujo de autenticación del despacho.',
    },
  });
}

export async function getBoeSchemas(_req: Request, res: Response) {
  return ok(res, getLocalBoeSchemaSummary());
}

export async function searchBoeDocuments(req: Request, res: Response) {
  const q = optionalParam(req.query.q);
  const title = optionalParam(req.query.title);
  const texto = optionalParam(req.query.texto);
  const rango = optionalParam(req.query.rango);
  const departamento = optionalParam(req.query.departamento);
  const materia = optionalParam(req.query.materia);
  const yearFrom = optionalParam(req.query.year_from);
  const yearTo = optionalParam(req.query.year_to);
  const limit = Math.min(Math.max(Number(req.query.limit || 1000), 1), 1000);
  if (!q && !title && !texto && !rango && !departamento && !materia && !yearFrom && !yearTo) {
    return err(res, 'Indica algún criterio de búsqueda para consultar el BOE.', 400);
  }

  try {
    const queryText = buildBoeQueryString([
      q ? `(numero_oficial:"${escapeBoeQueryValue(q)}" or titulo:"${escapeBoeQueryValue(q)}" or texto:"${escapeBoeQueryValue(q)}")` : null,
      title ? `titulo:"${escapeBoeQueryValue(title)}"` : null,
      texto ? `texto:"${escapeBoeQueryValue(texto)}"` : null,
      rango ? `rango:"${escapeBoeQueryValue(rango)}"` : null,
      departamento ? `departamento:"${escapeBoeQueryValue(departamento)}"` : null,
      materia ? `materias:"${escapeBoeQueryValue(materia)}"` : null,
      yearFrom ? `fecha_publicacion:[${escapeBoeQueryValue(yearFrom)}0101 TO *]` : null,
      yearTo ? `fecha_publicacion:[* TO ${escapeBoeQueryValue(yearTo)}1231]` : null,
    ]);
    const queryPayload = {
      query: {
        query_string: {
          query: queryText,
        },
      },
      sort: [{ fecha_publicacion: 'desc' }],
    };

    const url = `${BOE_API_BASE}/legislacion-consolidada?limit=${limit}&query=${encodeURIComponent(JSON.stringify(queryPayload))}`;
    const raw = await remoteGet(url, 'application/json,application/xml;q=0.9,*/*;q=0.8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.data) ? parsed.data : [];
    const rankedItems = dedupeAndRankBoeItems(items, { q, title, texto, rango, departamento, materia }).slice(0, limit);

    return ok(res, {
      query: q || title || texto || '',
      total: rankedItems.length,
      results: rankedItems.map((item: any) => ({
        identificador: item.identificador || null,
        titulo: item.titulo || null,
        numero_oficial: item.numero_oficial || null,
        fecha_publicacion: item.fecha_publicacion || null,
        fecha_disposicion: item.fecha_disposicion || null,
        departamento: item.departamento?.texto || item.departamento || null,
        rango: item.rango?.texto || item.rango || null,
        estado_consolidacion: item.estado_consolidacion?.texto || item.estado_consolidacion || null,
        url_html_consolidada: item.url_html_consolidada || null,
      })),
    });
  } catch (e: any) {
    return err(res, e.message || 'No se pudo buscar en el BOE.', 502);
  }
}

export async function getBoeDocumentById(req: Request, res: Response) {
  const id = String(req.params.id || '').trim().toUpperCase();
  if (!/^BOE-[A-Z]-\d{4}-\d+$/i.test(id)) {
    return err(res, 'Indica un identificador BOE válido, por ejemplo BOE-A-2020-8099.', 400);
  }

  try {
    const [metadataXml, blocksXml] = await Promise.all([
      remoteGetText(`${BOE_API_BASE}/legislacion-consolidada/id/${encodeURIComponent(id)}/metadatos`),
      remoteGetText(`${BOE_API_BASE}/legislacion-consolidada/id/${encodeURIComponent(id)}/texto/indice`),
    ]);

    const responseData = {
      id,
      titulo: extractFirstTag(metadataXml, 'titulo'),
      rango: extractFirstTag(metadataXml, 'rango'),
      fecha_publicacion: extractFirstTag(metadataXml, 'fecha_publicacion'),
      fecha_disposicion: extractFirstTag(metadataXml, 'fecha_disposicion'),
      departamento: extractFirstTag(metadataXml, 'departamento'),
      estado_consolidacion: extractFirstTag(metadataXml, 'estado_consolidacion'),
      materias: extractAllTagValues(metadataXml, 'materia').slice(0, 8),
      urlHtml: `https://www.boe.es/buscar/doc.php?id=${encodeURIComponent(id)}`,
      urlPdf: `https://www.boe.es/diario_boe/txt.php?id=${encodeURIComponent(id)}`,
      blocks: extractBoeBlocks(blocksXml),
    };

    return ok(res, responseData);
  } catch (e: any) {
    return err(res, e.message || 'No se pudo consultar el BOE.', 502);
  }
}

export async function getBoeBlockById(req: Request, res: Response) {
  const id = String(req.params.id || '').trim().toUpperCase();
  const blockId = String(req.params.blockId || '').trim().toLowerCase();
  if (!/^BOE-[A-Z]-\d{4}-\d+$/i.test(id)) {
    return err(res, 'Indica un identificador BOE válido, por ejemplo BOE-A-2020-8099.', 400);
  }
  if (!blockId) {
    return err(res, 'Indica un identificador de bloque válido.', 400);
  }

  try {
    const blockXml = await remoteGetText(`${BOE_API_BASE}/legislacion-consolidada/id/${encodeURIComponent(id)}/texto/bloque/${encodeURIComponent(blockId)}`);
    const parsed = extractBoeBlockContent(blockXml);
    if (!parsed) return err(res, 'No se pudo interpretar el bloque del BOE.', 502);

    return ok(res, {
      documentId: id,
      ...parsed,
      sourceUrl: `${BOE_API_BASE}/legislacion-consolidada/id/${encodeURIComponent(id)}/texto/bloque/${encodeURIComponent(blockId)}`,
      htmlUrl: `https://www.boe.es/buscar/act.php?id=${encodeURIComponent(id)}#${encodeURIComponent(blockId)}`,
    });
  } catch (e: any) {
    return err(res, e.message || 'No se pudo consultar el bloque del BOE.', 502);
  }
}

