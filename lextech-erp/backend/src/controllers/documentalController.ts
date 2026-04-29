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

function decodeHtmlText(text: string) {
  return decodeXml(
    text
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16))),
  );
}

function normalizeLooseText(text: string) {
  return decodeHtmlText(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLooseMultilineText(text: string) {
  return decodeHtmlText(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
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

function extractCendojHighlights(html: string) {
  const sectionMatch = html.match(/Resoluciones\s+m[aá]s\s+consultadas([\s\S]*?)Sentencias\s+por\s+tema/i);
  if (!sectionMatch) return [];

  const anchorMatches = [...sectionMatch[1].matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi)];
  return anchorMatches.slice(0, 8).map((match, index) => {
    const label = normalizeLooseText(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const href = match[1].startsWith('http')
      ? match[1]
      : `https://www.poderjudicial.es${match[1]}`;

    return {
      id: `${index + 1}`,
      title: label,
      url: href,
    };
  }).filter((item) => item.title);
}

function buildCendojSearchUrl(query: string, page = 1) {
  const offset = Math.max(1, ((page - 1) * 10) + 1);
  const sanitized = query
    .trim()
    .replace(/[\/\\]+/g, ' ')
    .replace(/\s+/g, ' ');
  return `https://www.poderjudicial.es/search/sentencias/${encodeURIComponent(sanitized)}/${offset}/PUB`;
}

function htmlToReadableText(html: string) {
  return normalizeLooseMultilineText(
    html
      .replace(/\r/g, '')
      .replace(/<(?:br|\/p|\/div|\/li|\/ul|\/ol|\/section|\/article|\/header|\/footer|\/h[1-6])\s*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .trim(),
  );
}

function extractLineValue(block: string, labels: string[]) {
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = block.match(new RegExp(`${escapedLabel}:\\s*([^\\n]+)`, 'i'));
    if (match) return match[1].trim();
  }
  return null;
}

function sanitizeCendojSummary(text: string | null) {
  if (!text) return null;

  return text
    .replace(/\bP[áa]gina\s+[\d\s]+\b[\s\S]*$/i, '')
    .replace(/\bIr\s+de\s+\d+[\s\S]*$/i, '')
    .replace(/Parece que no tiene configurado[\s\S]*$/i, '')
    .replace(/Copyright[\s\S]*$/i, '')
    .replace(/Consejo General del Poder Judicial[\s\S]*$/i, '')
    .replace(/Lo sentimos[\s\S]*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function dedupeCendojResults(items: any[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item?.roj || item?.ecli || item?.url || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCendojKey(value: string | null | undefined) {
  return normalizeSearchableText(value).replace(/\s+/g, '');
}

function extractCendojSearchResults(html: string) {
  const text = htmlToReadableText(html);
  const totalMatch = text.match(/Tema:\s*[^\n]+\n(\d+)\s+resultados/i);
  const recoverableMatch = text.match(/maximo documentos a recuperar\s+(\d+)/i);
  const anchors = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>\s*ROJ:\s*([^<]+?)\s*-\s*ECLI:\s*([^<]+?)\s*<\/a>/gi)].map((match) => ({
    href: match[1].startsWith('http') ? match[1] : `https://www.poderjudicial.es${match[1]}`,
    roj: normalizeCendojKey(match[2]),
    ecli: normalizeCendojKey(match[3]),
  }));
  const segments = text
    .split(/(?=\n?ROJ:\s*)/g)
    .map((segment) => segment.trim())
    .filter((segment) => /^ROJ:\s*/i.test(segment));

  const results = segments.map((segment, index) => {
    const headerMatch = segment.match(/^ROJ:\s*([^\n]+?)\s*-\s*ECLI:\s*([^\n]+)\n?/i);
    if (!headerMatch) return null;

    const body = segment
      .slice(headerMatch[0].length)
      .replace(/\nP[áa]gina[\s\S]*$/i, '')
      .replace(/\nParece que no tiene configurado[\s\S]*$/i, '')
      .replace(/\nCopyright[\s\S]*$/i, '')
      .replace(/\nLo sentimos[\s\S]*$/i, '')
      .trim();
    const summaryMatch = body.match(/Resumen:\s*([\s\S]*)/i);
    const summary = sanitizeCendojSummary(summaryMatch
      ? summaryMatch[1].replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
      : null);
    const roj = headerMatch[1].trim();
    const ecli = headerMatch[2].trim();
    const normalizedRoj = normalizeCendojKey(roj);
    const normalizedEcli = normalizeCendojKey(ecli);
    const anchor = anchors.find((item) => item.roj === normalizedRoj && item.ecli === normalizedEcli) || anchors[index];
    const exactFallbackUrl = buildCendojSearchUrl(roj || ecli, 1);

    return {
      id: `${index + 1}`,
      roj,
      ecli,
      organo: extractLineValue(body, ['Tipo Órgano', 'Tipo Organo']),
      municipio: extractLineValue(body, ['Municipio']),
      ponente: extractLineValue(body, ['Ponente']),
      numeroRecurso: extractLineValue(body, ['Nº Recurso', 'No Recurso', 'N° Recurso']),
      fecha: extractLineValue(body, ['Fecha']),
      tipoResolucion: extractLineValue(body, ['Tipo Resolución', 'Tipo Resolucion']),
      resumen: summary,
      url: anchor?.href || exactFallbackUrl,
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item?.roj || item?.ecli));

  return {
    total: totalMatch ? Number(totalMatch[1]) : results.length,
    recoverableMax: recoverableMatch ? Number(recoverableMatch[1]) : null,
    results,
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
      status: 'partial',
      mode: 'portal_publico',
      docsUrl: CENDOJ_INFO_URL,
      searchUrl: CENDOJ_PORTAL_URL,
      supports: ['portal_oficial', 'resoluciones_destacadas', 'enlaces_oficiales'],
      note: 'Preparado con acceso al portal oficial público. No se ha encontrado una API pública oficial documentada equivalente al BOE.',
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

export async function getCendojHighlights(_req: Request, res: Response) {
  try {
    const html = await remoteGetText(CENDOJ_PORTAL_URL);
    const highlights = extractCendojHighlights(html);

    if (highlights.length > 0) {
      return ok(res, {
        portalUrl: CENDOJ_PORTAL_URL,
        infoUrl: CENDOJ_INFO_URL,
        highlights,
      });
    }

    const fallbackHtml = await remoteGet(buildCendojSearchUrl('caducidad', 1), 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    const fallback = extractCendojSearchResults(fallbackHtml).results.slice(0, 5).map((item, index) => ({
      id: item.id || `${index + 1}`,
      title: [item.roj, item.ecli, item.tipoResolucion].filter(Boolean).join(' · ') || 'Resolución CENDOJ',
      url: item.url || CENDOJ_PORTAL_URL,
    }));

    return ok(res, {
      portalUrl: CENDOJ_PORTAL_URL,
      infoUrl: CENDOJ_INFO_URL,
      highlights: fallback,
    });
  } catch (e: any) {
    return ok(res, {
      portalUrl: CENDOJ_PORTAL_URL,
      infoUrl: CENDOJ_INFO_URL,
      highlights: [],
      warning: e.message || 'No se pudieron cargar los destacados de CENDOJ.',
    });
  }
}

export async function searchCendoj(req: Request, res: Response) {
  const q = String(req.query.q || '').trim();
  const organo = String(req.query.organo || '').trim();
  const tipo = String(req.query.tipo || '').trim();
  const ponente = String(req.query.ponente || '').trim();
  const year = String(req.query.year || '').trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  if (!q && !organo && !tipo && !ponente && !year) {
    return err(res, 'Indica algún criterio de búsqueda para consultar CENDOJ.', 400);
  }

  try {
    const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    const composedQuery = [q, organo, tipo, ponente, year].filter(Boolean).join(' ');
    const maxPages = Math.min(Math.max(Number(req.query.max_pages || 100), 1), 100);
    const allResults: any[] = [];
    let detectedTotal = 0;
    let recoverableMax: number | null = null;
    let firstSearchUrl = '';

    for (let currentPage = page; currentPage < page + maxPages; currentPage++) {
      const searchUrl = buildCendojSearchUrl(composedQuery, currentPage);
      if (!firstSearchUrl) firstSearchUrl = searchUrl;
      let html: string;

      try {
        html = await remoteGet(searchUrl, accept);
      } catch (firstError: any) {
        const fallbackUrl = buildCendojSearchUrl(composedQuery.replace(/[\/\\]+/g, ' '), currentPage);
        if (fallbackUrl === searchUrl) throw firstError;
        html = await remoteGet(fallbackUrl, accept);
      }

      const parsed = extractCendojSearchResults(html);
      detectedTotal = Math.max(detectedTotal, parsed.total || 0);
      if (typeof parsed.recoverableMax === 'number') {
        recoverableMax = parsed.recoverableMax;
      }
      const batch = parsed.results || [];
      if (batch.length === 0) break;
      allResults.push(...batch);
      if (batch.length < 10) break;
    }

    const normalizedOrgano = organo.toLowerCase();
    const normalizedTipo = tipo.toLowerCase();
    const normalizedPonente = ponente.toLowerCase();
    const filteredResults = dedupeCendojResults(allResults).filter((item) => {
      const organoOk = !normalizedOrgano || String(item.organo || '').toLowerCase().includes(normalizedOrgano);
      const tipoOk = !normalizedTipo || String(item.tipoResolucion || '').toLowerCase().includes(normalizedTipo);
      const ponenteOk = !normalizedPonente || String(item.ponente || '').toLowerCase().includes(normalizedPonente);
      const yearOk = !year || String(item.fecha || '').includes(year);
      return organoOk && tipoOk && ponenteOk && yearOk;
    });

    return ok(res, {
      query: composedQuery,
      page,
      searchUrl: firstSearchUrl || buildCendojSearchUrl(composedQuery, page),
      total: filteredResults.length,
      remoteTotal: detectedTotal || filteredResults.length,
      recoverableMax,
      results: filteredResults,
    });
  } catch (e: any) {
    if (String(e?.message || '').includes('403')) {
      const composedQuery = [q, organo, tipo, ponente, year].filter(Boolean).join(' ');
      return ok(res, {
        query: composedQuery,
        page,
        searchUrl: buildCendojSearchUrl(composedQuery, page),
        total: 0,
        remoteTotal: null,
        recoverableMax: null,
        results: [],
        blocked: true,
        warning: 'CENDOJ ha bloqueado la consulta automática (403). Puedes abrir la búsqueda oficial directamente en el portal.',
      });
    }
    if (String(e?.message || '').includes('404')) {
      return ok(res, {
        query: [q, organo, tipo, ponente, year].filter(Boolean).join(' '),
        page,
        searchUrl: buildCendojSearchUrl([q, organo, tipo, ponente, year].filter(Boolean).join(' '), page),
        total: 0,
        results: [],
      });
    }
    return err(res, e.message || 'No se pudo buscar en CENDOJ.', 502);
  }
}
