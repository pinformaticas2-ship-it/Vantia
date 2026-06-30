import { Response } from 'express';
import { createWorker, PSM } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

type DniScanData = {
  first_name: string | null;
  last_name: string | null;
  nif_cif: string | null;
  birth_date: string | null;
  address_town: string | null;
  address_street: string | null;
  address_cp: string | null;
  address_province: string | null;
  address_country: string | null;
  gender: string | null;
  nationality: string | null;
  expedition_country: string | null;
  document_type: string | null;
};

type UploadedOcrFile = {
  path: string;
  mimetype: string;
  fieldname: string;
  originalname?: string;
};

const EMPTY_SCAN: DniScanData = {
  first_name: null,
  last_name: null,
  nif_cif: null,
  birth_date: null,
  address_town: null,
  address_street: null,
  address_cp: null,
  address_province: null,
  address_country: null,
  gender: null,
  nationality: null,
  expedition_country: null,
  document_type: null,
};

const PROVINCIAS = [
  'ALAVA', 'ALBACETE', 'ALICANTE', 'ALMERIA', 'ASTURIAS', 'AVILA', 'BADAJOZ', 'BARCELONA', 'BURGOS',
  'CACERES', 'CADIZ', 'CANTABRIA', 'CASTELLON', 'CIUDAD REAL', 'CORDOBA', 'CUENCA', 'GIRONA', 'GRANADA',
  'GUADALAJARA', 'GUIPUZCOA', 'HUELVA', 'HUESCA', 'ILLES BALEARS', 'JAEN', 'LA CORUNA', 'LA RIOJA',
  'LAS PALMAS', 'LEON', 'LLEIDA', 'LUGO', 'MADRID', 'MALAGA', 'MURCIA', 'NAVARRA', 'OURENSE', 'PALENCIA',
  'PONTEVEDRA', 'SALAMANCA', 'SANTA CRUZ DE TENERIFE', 'SEGOVIA', 'SEVILLA', 'SORIA', 'TARRAGONA', 'TERUEL',
  'TOLEDO', 'VALENCIA', 'VALLADOLID', 'VIZCAYA', 'ZAMORA', 'ZARAGOZA', 'CEUTA', 'MELILLA',
];
const PROVINCIAS_DISPLAY: Record<string, string> = {
  ALAVA: 'Álava',
  ALBACETE: 'Albacete',
  ALICANTE: 'Alicante',
  ALMERIA: 'Almería',
  ASTURIAS: 'Asturias',
  AVILA: 'Ávila',
  BADAJOZ: 'Badajoz',
  BARCELONA: 'Barcelona',
  BURGOS: 'Burgos',
  CACERES: 'Cáceres',
  CADIZ: 'Cádiz',
  CANTABRIA: 'Cantabria',
  CASTELLON: 'Castellón',
  'CIUDAD REAL': 'Ciudad Real',
  CORDOBA: 'Córdoba',
  CUENCA: 'Cuenca',
  GIRONA: 'Girona',
  GRANADA: 'Granada',
  GUADALAJARA: 'Guadalajara',
  GUIPUZCOA: 'Guipúzcoa',
  HUELVA: 'Huelva',
  HUESCA: 'Huesca',
  'ILLES BALEARS': 'Illes Balears',
  JAEN: 'Jaén',
  'LA CORUNA': 'La Coruña',
  'LA RIOJA': 'La Rioja',
  'LAS PALMAS': 'Las Palmas',
  LEON: 'León',
  LLEIDA: 'Lleida',
  LUGO: 'Lugo',
  MADRID: 'Madrid',
  MALAGA: 'Málaga',
  MURCIA: 'Murcia',
  NAVARRA: 'Navarra',
  OURENSE: 'Ourense',
  PALENCIA: 'Palencia',
  PONTEVEDRA: 'Pontevedra',
  SALAMANCA: 'Salamanca',
  'SANTA CRUZ DE TENERIFE': 'Santa Cruz de Tenerife',
  SEGOVIA: 'Segovia',
  SEVILLA: 'Sevilla',
  SORIA: 'Soria',
  TARRAGONA: 'Tarragona',
  TERUEL: 'Teruel',
  TOLEDO: 'Toledo',
  VALENCIA: 'Valencia',
  VALLADOLID: 'Valladolid',
  VIZCAYA: 'Vizcaya',
  ZAMORA: 'Zamora',
  ZARAGOZA: 'Zaragoza',
  CEUTA: 'Ceuta',
  MELILLA: 'Melilla',
};
const GEMINI_OCR_MODEL_CANDIDATES = [
  process.env.GEMINI_OCR_MODEL,
  'gemini-2.5-flash',
].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return apiKey ? new GoogleGenerativeAI(apiKey) : null;
}

function isRetryableGeminiError(error: any) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('503') ||
    message.includes('service unavailable') ||
    message.includes('high demand') ||
    message.includes('try again later') ||
    message.includes('temporarily unavailable')
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWhitespace(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function toUpperAscii(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function fixOcrDigitConfusions(value: string) {
  return value
    .replace(/[OQ]/g, '0')
    .replace(/I/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2');
}

function fixOcrDateDigits(value: string) {
  // Corrige confusiones OCR en posiciones donde se esperan dígitos
  return value
    .replace(/[OoQq]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2');
}

function calculateDniLetter(number: string) {
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  return letters[parseInt(number, 10) % 23];
}

function normalizeNifNie(raw: string | null | undefined) {
  if (!raw) return null;
  const compact = toUpperAscii(raw).replace(/[^A-Z0-9]/g, '');
  if (!compact) return null;

  if (/^\d{8}[A-Z]$/.test(compact)) {
    return calculateDniLetter(compact.slice(0, 8)) === compact.slice(-1) ? compact : null;
  }

  if (/^[XYZ][0-9]{7}[A-Z]$/.test(compact)) {
    const prefixMap: Record<string, string> = { X: '0', Y: '1', Z: '2' };
    const numeric = `${prefixMap[compact[0]]}${compact.slice(1, 8)}`;
    return calculateDniLetter(numeric) === compact.slice(-1) ? compact : null;
  }

  const maybeDni = compact.match(/^([0-9OQISBZ]{8})([A-Z])$/);
  if (maybeDni) return normalizeNifNie(`${fixOcrDigitConfusions(maybeDni[1])}${maybeDni[2]}`);

  const maybeNie = compact.match(/^([XYZ])([0-9OQISBZ]{7})([A-Z])$/);
  if (maybeNie) return normalizeNifNie(`${maybeNie[1]}${fixOcrDigitConfusions(maybeNie[2])}${maybeNie[3]}`);

  return null;
}

function toIsoDate(day: string, month: string, year: string) {
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return iso;
}

function parseDateCandidate(raw: string | null | undefined) {
  if (!raw) return null;
  // Aplica corrección OCR antes de parsear
  const fixed = fixOcrDateDigits(raw);
  const compact = fixed.replace(/\s+/g, '');

  let match = compact.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})$/);
  if (match) return toIsoDate(match[1], match[2], match[3]);

  match = compact.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (match) return toIsoDate(match[1], match[2], match[3]);

  match = compact.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    const fullYear = parseInt(match[3], 10) > 30 ? `19${match[3]}` : `20${match[3]}`;
    return toIsoDate(match[1], match[2], fullYear);
  }

  return null;
}

function normalizeGender(raw: string | null | undefined) {
  const value = toUpperAscii(raw || '');
  if (!value) return null;
  if (value === 'M' || value.includes('MASC')) return 'M';
  if (value === 'F' || value.includes('FEM')) return 'F';
  return null;
}

function smartTitleCase(raw: string | null | undefined) {
  const value = normalizeWhitespace(raw);
  if (!value) return null;
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanupName(raw: string | null | undefined) {
  const value = normalizeWhitespace(raw);
  if (!value) return null;
  const cleaned = value
    .replace(/[<|]/g, ' ')
    .replace(/\b(ESPANA|ESPANOLA|ESPANOL|ESP|DNI|NIE|DOCUMENTO|NACIONALIDAD|NOMBRE|APELLIDOS|SEXO|NACIMIENTO|EMISION|VALIDEZ)\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const upper = toUpperAscii(cleaned);
  if (!cleaned) return null;
  if (upper.startsWith('IDESP') || /[0-9]{4,}/.test(upper) || /^[A-Z0-9]{12,}$/.test(upper)) return null;
  return smartTitleCase(cleaned);
}

function pickBest<T>(...values: Array<T | null | undefined>) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function mergeScanData(primary: DniScanData, secondary: Partial<DniScanData>): DniScanData {
  return {
    first_name: pickBest(secondary.first_name, primary.first_name),
    last_name: pickBest(secondary.last_name, primary.last_name),
    nif_cif: pickBest(secondary.nif_cif, primary.nif_cif),
    birth_date: pickBest(secondary.birth_date, primary.birth_date),
    address_town: pickBest(secondary.address_town, primary.address_town),
    address_street: pickBest(secondary.address_street, primary.address_street),
    address_cp: pickBest(secondary.address_cp, primary.address_cp),
    address_province: pickBest(secondary.address_province, primary.address_province),
    address_country: pickBest(secondary.address_country, primary.address_country),
    gender: pickBest(secondary.gender, primary.gender),
    nationality: pickBest(secondary.nationality, primary.nationality),
    expedition_country: pickBest(secondary.expedition_country, primary.expedition_country),
    document_type: pickBest(secondary.document_type, primary.document_type),
  };
}

function mergePriorityIdentity(primary: DniScanData, secondary: Partial<DniScanData>): DniScanData {
  const merged = mergeScanData(primary, secondary);
  return {
    ...merged,
    first_name: pickBest(secondary.first_name, primary.first_name),
    last_name: pickBest(secondary.last_name, primary.last_name),
    birth_date: pickBest(secondary.birth_date, primary.birth_date),
    gender: pickBest(secondary.gender, primary.gender),
    document_type: pickBest(secondary.document_type, primary.document_type),
  };
}

function parseMrzNameLine(line: string) {
  const normalized = line.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
  if (!normalized.includes('<<')) {
    return { first_name: null, last_name: null };
  }

  const [surnamePart = '', givenPart = ''] = normalized.split('<<', 2);
  const last_name = cleanupName(surnamePart.replace(/<+/g, ' '));
  const first_name = cleanupName(givenPart.replace(/<+/g, ' '));
  return { first_name, last_name };
}

function extractSpanishDniMrz(lines: string[]) {
  const normalized = lines
    .map((line) => line.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, ''))
    .filter(Boolean);

  for (let index = 0; index <= normalized.length - 3; index += 1) {
    const line1 = normalized[index];
    const line2 = normalized[index + 1];
    const line3 = normalized[index + 2];

    const looksLikeLine1 = line1.startsWith('IDESP') || line1.startsWith('I<ESP');
    const looksLikeLine2 = /\d{6}[MF<]\d{6}[A-Z<]{3}/.test(line2);
    const looksLikeLine3 = line3.includes('<<') && /[A-Z]{2,}/.test(line3);

    if (!looksLikeLine1 || !looksLikeLine2 || !looksLikeLine3) continue;

    const parsedName = parseMrzNameLine(line3);
    const birthGenderMatch = line2.match(/(\d{6})([MF<])/);
    const birthDate = birthGenderMatch ? parseDateCandidate(birthGenderMatch[1]) : null;
    const gender = birthGenderMatch ? normalizeGender(birthGenderMatch[2]) : null;
    const nifCandidate = line1.match(/([0-9OQISBZ]{8}[A-Z]|[XYZ][0-9OQISBZ]{7}[A-Z])/)?.[1];

    return {
      last_name: parsedName.last_name,
      first_name: parsedName.first_name,
      birth_date: birthDate,
      gender,
      nif_cif: normalizeNifNie(nifCandidate),
      document_type: 'DNI',
    };
  }

  return null;
}

function extractDateCandidates(raw: string | null | undefined) {
  if (!raw) return [];
  // Aplicar corrección OCR antes de buscar fechas
  const normalized = normalizeWhitespace(fixOcrDateDigits(raw));
  const values = new Set<string>();

  // DD/MM/YYYY o DD.MM.YYYY o DD-MM-YYYY o DD MM YYYY
  for (const match of normalized.matchAll(/\b(\d{2})[\s\/.\-](\d{2})[\s\/.\-](\d{4})\b/g)) {
    const iso = toIsoDate(match[1], match[2], match[3]);
    if (iso) values.add(iso);
  }

  // DDMMYYYY sin separadores
  for (const match of normalized.matchAll(/\b(\d{8})\b/g)) {
    const iso = parseDateCandidate(match[1]);
    if (iso) values.add(iso);
  }

  // YYMMDD (formato MRZ)
  for (const match of normalized.matchAll(/\b(\d{6})\b/g)) {
    const iso = parseDateCandidate(match[1]);
    if (iso) values.add(iso);
  }

  // Formato DNI español: dos dígitos separados por espacio → DD MM AAAA
  // ej. "12 O5 1990" o "12 05 1990" o con espacios irregulares
  for (const match of normalized.matchAll(/(\d{2})\s+(\d{2})\s+(\d{4})/g)) {
    const iso = toIsoDate(match[1], match[2], match[3]);
    if (iso) values.add(iso);
  }

  return Array.from(values);
}

function isReasonableBirthDate(raw: string | null | undefined) {
  if (!raw) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const age = now.getUTCFullYear() - date.getUTCFullYear() - (
    now.getUTCMonth() < date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())
      ? 1
      : 0
  );

  return age >= 0 && age <= 120;
}

function getLabelDateCandidates(lines: string[], labels: string[], options?: { maxLines?: number }) {
  const maxLines = options?.maxLines ?? 2;
  const normalizedLabels = labels.map((label) => toUpperAscii(label));
  const values: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeWhitespace(lines[index]);
    const normalizedLine = toUpperAscii(line);
    const matchedLabel = normalizedLabels.find((label) => normalizedLine.startsWith(label));
    if (!matchedLabel) continue;

    const candidates = new Set<string>();
    extractDateCandidates(line.slice(matchedLabel.length)).forEach((value) => candidates.add(value));

    for (let offset = 1; offset <= maxLines; offset += 1) {
      const nextLine = normalizeWhitespace(lines[index + offset]);
      if (!nextLine) continue;
      if (isLikelyLabelLine(nextLine)) break;
      extractDateCandidates(nextLine).forEach((value) => candidates.add(value));
    }

    values.push(...Array.from(candidates));
  }

  return values.filter(isReasonableBirthDate);
}

function pickLikelyBirthDate(candidates: string[]) {
  const unique = Array.from(new Set(candidates)).filter(isReasonableBirthDate);
  if (!unique.length) return null;

  const sorted = unique.sort((a, b) => a.localeCompare(b));
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setUTCFullYear(eighteenYearsAgo.getUTCFullYear() - 18);

  const adultCandidate = sorted.find((value) => new Date(`${value}T00:00:00Z`) <= eighteenYearsAgo);
  return adultCandidate || sorted[0];
}

function extractRightSideBirthDate(text: string) {
  // Aplica corrección OCR al texto completo antes de buscar
  const fixedText = fixOcrDateDigits(text);

  // Variantes del label en el DNI español
  const nacimientoLabels = [
    'FECHA DE NACIMIENTO', 'NACIMIENTO', 'F NACIMIENTO',
    'FECHA NAC', 'NACIMIENTO:', 'DATE OF BIRTH',
  ];

  for (const label of nacimientoLabels) {
    const idx = fixedText.indexOf(label);
    if (idx === -1) continue;

    // Ventana de búsqueda ampliada después del label
    const window = fixedText.slice(idx, Math.min(fixedText.length, idx + 120));

    // Intento 1: DD MM AAAA (formato más común en DNI español)
    const m1 = window.match(/(\d{2})\s+(\d{2})\s+(\d{4})/);
    if (m1) {
      const iso = toIsoDate(m1[1], m1[2], m1[3]);
      if (isReasonableBirthDate(iso)) return iso;
    }

    // Intento 2: DD/MM/AAAA o DD.MM.AAAA o DD-MM-AAAA
    const m2 = window.match(/(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/);
    if (m2) {
      const iso = toIsoDate(m2[1], m2[2], m2[3]);
      if (isReasonableBirthDate(iso)) return iso;
    }

    // Intento 3: 8 dígitos pegados DDMMYYYY
    const m3 = window.match(/\b(\d{8})\b/);
    if (m3) {
      const iso = parseDateCandidate(m3[1]);
      if (isReasonableBirthDate(iso)) return iso;
    }

    // Fallback: cualquier fecha en la ventana
    const nearbyDates = extractDateCandidates(window).filter(isReasonableBirthDate);
    const candidate = pickLikelyBirthDate(nearbyDates);
    if (candidate) return candidate;
  }

  return null;
}

function extractMrzData(lines: string[]) {
  const spanishMrz = extractSpanishDniMrz(lines);
  if (spanishMrz) return spanishMrz;

  const normalized = lines
    .map((line) => line.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, ''))
    .filter(Boolean);

  const nameLineIndex = normalized.findIndex((line) =>
    line.includes('<<') &&
    /[A-Z]{2,}/.test(line) &&
    !line.startsWith('IDESP') &&
    !/^I?DESP/.test(line) &&
    !/^\d/.test(line),
  );
  if (nameLineIndex === -1) {
    return { first_name: null, last_name: null, birth_date: null, gender: null, nif_cif: null, document_type: null };
  }

  const nameLine = normalized[nameLineIndex];
  const nearbyLines = normalized.slice(Math.max(0, nameLineIndex - 3), Math.min(normalized.length, nameLineIndex + 3));
  const identityLine = nearbyLines.find((line) => /([XYZ0-9OQISBZ]{8}[A-Z]|[XYZ][0-9OQISBZ]{7}[A-Z])/.test(line)) || '';
  const birthGenderLine =
    nearbyLines.find((line) => /\d{6}[MF<]\d{6}/.test(line)) ||
    nearbyLines.find((line) => /\d{6}[MF<]/.test(line)) ||
    normalized[nameLineIndex - 1] ||
    '';
  const parsedName = parseMrzNameLine(nameLine);
  const birthGenderMatch = birthGenderLine.match(/(\d{6})([MF<])/);
  const birthDate = birthGenderMatch ? parseDateCandidate(birthGenderMatch[1]) : null;
  const gender = birthGenderMatch ? normalizeGender(birthGenderMatch[2]) : null;
  const nifCandidate = identityLine.match(/([0-9OQISBZ]{8}[A-Z]|[XYZ][0-9OQISBZ]{7}[A-Z])/)?.[1];

  return {
    last_name: parsedName.last_name,
    first_name: parsedName.first_name,
    birth_date: birthDate,
    gender,
    nif_cif: normalizeNifNie(nifCandidate),
    document_type: identityLine.includes('NIE') ? 'NIE' : 'DNI',
  };
}

function parseProvince(text: string) {
  const province = PROVINCIAS.find((candidate) => text.includes(candidate));
  return province ? PROVINCIAS_DISPLAY[province] || smartTitleCase(province) : null;
}

function parseAddressStreet(text: string) {
  const streetMatch = text.match(/(?:DOMICILIO|ADDRESS)\s*[:\-]?\s*([A-Z0-9Ñªº.,\-/ ]{6,120})/);
  return smartTitleCase(streetMatch?.[1]) || null;
}

function isSpanishPostalCode(raw: string | null | undefined) {
  if (!raw || !/^\d{5}$/.test(raw)) return false;
  const provinceCode = parseInt(raw.slice(0, 2), 10);
  return provinceCode >= 1 && provinceCode <= 52;
}

function parsePostalCode(text: string, options?: { strictSpanish?: boolean }) {
  // Aplica corrección OCR: dígitos que podrían ser letras mal leídas
  const fixed = fixOcrDateDigits(text);

  // Busca secuencias de exactamente 5 dígitos con fronteras flexibles
  // Acepta: word boundary, espacio, inicio de línea, coma, guion
  const strictCandidates = Array.from(fixed.matchAll(/(?<![0-9])(\d{5})(?![0-9])/g)).map(m => m[1]);
  const allCandidates = Array.from(fixed.matchAll(/(\d{5})/g)).map(m => m[1]);

  const candidates = strictCandidates.length ? strictCandidates : allCandidates;
  if (!candidates.length) return null;

  if (options?.strictSpanish) {
    // Prioridad: CP válido español estricto
    const validSpanish = candidates.find(isSpanishPostalCode);
    if (validSpanish) return validSpanish;
    // Fallback: primer candidato de 5 dígitos aunque no sea español validado
    return candidates.find(c => /^\d{5}$/.test(c)) || null;
  }

  return candidates.find(isSpanishPostalCode) || candidates[0] || null;
}

const DNI_FIELD_LABELS = [
  'APELLIDOS',
  'APELLIDO',
  'NOMBRE',
  'SEXO',
  'NACIONALIDAD',
  'NACIMIENTO',
  'FECHA DE NACIMIENTO',
  'DOMICILIO',
  'LUGAR DE NACIMIENTO',
  'MUNICIPIO',
  'LOCALIDAD',
];

function isLikelyLabelLine(line: string) {
  const normalized = toUpperAscii(line);
  return DNI_FIELD_LABELS.some((label) => normalized.startsWith(label));
}

function getFieldValueFromLines(lines: string[], labels: string[], options?: { maxLines?: number }) {
  const maxLines = options?.maxLines ?? 1;
  const normalizedLabels = labels.map((label) => toUpperAscii(label));

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeWhitespace(lines[index]);
    const normalizedLine = toUpperAscii(line);
    const matchedLabel = normalizedLabels.find((label) => normalizedLine.startsWith(label));
    if (!matchedLabel) continue;

    const inlineValue = normalizeWhitespace(line.slice(matchedLabel.length).replace(/^[:.\-\s]+/, ''));
    if (inlineValue) return inlineValue;

    const collected: string[] = [];
    for (let offset = 1; offset <= maxLines; offset += 1) {
      const nextLine = normalizeWhitespace(lines[index + offset]);
      if (!nextLine) continue;
      if (isLikelyLabelLine(nextLine)) break;
      collected.push(nextLine);
    }

    if (collected.length) return collected.join(' ');
  }

  return null;
}

function getFieldBlockFromLines(lines: string[], labels: string[], options?: { maxLines?: number }) {
  const maxLines = options?.maxLines ?? 3;
  const normalizedLabels = labels.map((label) => toUpperAscii(label));

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeWhitespace(lines[index]);
    const normalizedLine = toUpperAscii(line);
    const matchedLabel = normalizedLabels.find((label) => normalizedLine.startsWith(label));
    if (!matchedLabel) continue;

    const collected: string[] = [];
    const inlineValue = normalizeWhitespace(line.slice(matchedLabel.length).replace(/^[:.\-\s]+/, ''));
    if (inlineValue) collected.push(inlineValue);

    for (let offset = 1; offset <= maxLines; offset += 1) {
      const nextLine = normalizeWhitespace(lines[index + offset]);
      if (!nextLine) continue;
      if (isLikelyLabelLine(nextLine)) break;
      collected.push(nextLine);
    }

    return collected;
  }

  return [];
}

function parseDNIText(raw: string): DniScanData {
  const asciiText = toUpperAscii(raw || '');
  const text = asciiText.replace(/[|]/g, 'I');
  const lines = text.split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
  const mrzData = extractMrzData(lines);

  const candidates = new Set<string>();
  for (const match of text.matchAll(/\b([XYZ0-9OQISBZ]{8,9}[A-Z])\b/g)) {
    const candidate = normalizeNifNie(match[1]);
    if (candidate) candidates.add(candidate);
  }

  const mrzDocLine = lines.find((line) => line.includes('IDESP') || line.includes('I<ESP') || line.includes('DNI'));
  if (mrzDocLine) {
    const candidate = normalizeNifNie(mrzDocLine.match(/([XYZ0-9OQISBZ]{8}[A-Z]|[XYZ][0-9OQISBZ]{7}[A-Z])/)?.[1]);
    if (candidate) candidates.add(candidate);
  }

  const surnameBlock = getFieldBlockFromLines(lines, ['APELLIDOS', 'APELLIDO'], { maxLines: 3 })
    .map((line) => cleanupName(line))
    .filter(Boolean) as string[];
  const nameBlock = getFieldBlockFromLines(lines, ['NOMBRE'], { maxLines: 2 })
    .map((line) => cleanupName(line))
    .filter(Boolean) as string[];

  const freeTextLastName =
    surnameBlock[0] ||
    cleanupName(getFieldValueFromLines(lines, ['APELLIDOS', 'APELLIDO'], { maxLines: 2 })) ||
    cleanupName(text.match(/APELLIDOS?\s*[:\-]?\s*([A-ZÑ ]{3,60})/)?.[1]) ||
    cleanupName(text.match(/1ER APELLIDO\s*[:\-]?\s*([A-ZÑ ]{3,40})/)?.[1]);
  const freeTextFirstName =
    nameBlock[0] ||
    cleanupName(getFieldValueFromLines(lines, ['NOMBRE'])) ||
    cleanupName(text.match(/NOMBRE\s*[:\-]?\s*([A-ZÑ ]{2,40})/)?.[1]);
  const labeledGender = getFieldValueFromLines(lines, ['SEXO']);
  const labeledBirthDate = getFieldValueFromLines(lines, ['FECHA DE NACIMIENTO', 'NACIMIENTO']);
  const labeledNationality = getFieldValueFromLines(lines, ['NACIONALIDAD']);
  const labeledTown = getFieldValueFromLines(lines, ['LOCALIDAD', 'MUNICIPIO', 'LUGAR DE NACIMIENTO'], { maxLines: 2 });
  const domicilioBlock = getFieldBlockFromLines(lines, ['DOMICILIO'], { maxLines: 3 });
  const domicilioText = domicilioBlock.join(' ');
  const domicilioStreet = domicilioBlock[0] || null;
  const domicilioTail = domicilioBlock.slice(1).join(' ');

  // Texto con corrección OCR para la búsqueda de fechas
  const textFixed = fixOcrDateDigits(text);

  const birthDateCandidates = [
    extractRightSideBirthDate(textFixed),
    ...getLabelDateCandidates(
      textFixed.split('\n').map(l => normalizeWhitespace(l)).filter(Boolean),
      ['FECHA DE NACIMIENTO', 'NACIMIENTO', 'F NACIMIENTO', 'FECHA NAC'],
      { maxLines: 3 }
    ),
    ...extractDateCandidates(textFixed.match(/(?:FECHA DE NACIMIENTO|NACIMIENTO|BIRTH DATE|F NACIMIENTO)\s*[:\-]?\s*([0-9\/.\-\s]{6,20})/)?.[1]),
    // Fallback: buscar formato "DD MM AAAA" en todo el texto (formato estándar del DNI español)
    ...(() => {
      const vals: string[] = [];
      for (const m of textFixed.matchAll(/(\d{2})\s+(\d{2})\s+((?:19|20)\d{2})/g)) {
        const iso = toIsoDate(m[1], m[2], m[3]);
        if (isReasonableBirthDate(iso) && iso) vals.push(iso);
      }
      return vals;
    })(),
  ].filter(isReasonableBirthDate);

  const fallbackBirthDates = extractDateCandidates(textFixed)
    .filter(isReasonableBirthDate)
    .sort((a, b) => a.localeCompare(b));
  // Buscar CP en el bloque de domicilio primero, luego en todo el texto
  const cpFromDomicilio =
    parsePostalCode(domicilioTail, { strictSpanish: true }) ||
    parsePostalCode(domicilioText, { strictSpanish: true });
  // Buscar directamente en el texto completo si no se encontró en domicilio
  const cpFromFullText = parsePostalCode(text, { strictSpanish: true });
  // Buscar con regex explícito para "CP XXXXX" o "C.P. XXXXX"
  const cpLabelMatch = text.match(/(?:C\.?P\.?|COD\.?\s*POSTAL|CODIGO\s*POSTAL)[:\s]*(\d{5})/);
  const cpFromLabel = cpLabelMatch ? (isSpanishPostalCode(fixOcrDateDigits(cpLabelMatch[1])) ? fixOcrDateDigits(cpLabelMatch[1]) : null) : null;
  const domicilioPostalCode = cpFromLabel || cpFromDomicilio || cpFromFullText;

  const birthDate =
    pickLikelyBirthDate(birthDateCandidates) ||
    mrzData.birth_date ||
    pickLikelyBirthDate(fallbackBirthDates) ||
    parseDateCandidate(labeledBirthDate);

  const addressTown =
    smartTitleCase(labeledTown) ||
    smartTitleCase(domicilioTail) ||
    smartTitleCase(text.match(/(?:LOCALIDAD|MUNICIPIO|LUGAR DE NACIMIENTO|POBLACION)\s*[:\-]?\s*([A-ZÑ ]{3,50})/)?.[1]) ||
    null;
  const document_type = text.includes('NIE') ? 'NIE' : text.includes('PASAPORTE') ? 'Pasaporte' : 'DNI';

  return {
    first_name: pickBest(freeTextFirstName, mrzData.first_name),
    last_name: pickBest(freeTextLastName, mrzData.last_name),
    nif_cif: pickBest(mrzData.nif_cif, Array.from(candidates)[0] || null),
    birth_date: birthDate,
    address_town: addressTown,
    address_street: smartTitleCase(domicilioStreet) || parseAddressStreet(text),
    address_cp: domicilioPostalCode || parsePostalCode(text, { strictSpanish: true }),
    address_province: parseProvince(domicilioTail || domicilioText) || parseProvince(text),
    address_country: text.includes('ESPANA') || text.includes('ESP') ? 'España' : null,
    gender: pickBest(mrzData.gender, normalizeGender(labeledGender), normalizeGender(text.match(/(?:SEXO|SEX)\s*[:\-]?\s*([MF])/i)?.[1])),
    nationality: labeledNationality
      ? smartTitleCase(labeledNationality)
      : text.includes('ESPANA') || text.includes('ESP')
        ? 'Española'
        : smartTitleCase(text.match(/(?:NACIONALIDAD|NATIONALITY)\s*[:\-]?\s*([A-ZÑ ]{3,30})/)?.[1]),
    expedition_country: text.includes('ESPANA') || text.includes('ESP') ? 'España' : null,
    document_type: pickBest(mrzData.document_type, document_type),
  };
}
async function runTesseractScan(filePath: string) {
  const worker = await createWorker(['spa', 'eng'], 1, { logger: () => {} });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(filePath);
    return { text: data.text || '', confidence: Math.round(data.confidence || 0) };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

async function runTesseractBirthDateScan(filePath: string) {
  const worker = await createWorker(['spa', 'eng'], 1, { logger: () => {} });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /.-',
    });
    const { data } = await worker.recognize(filePath);
    const text = data.text || '';
    return {
      text,
      birth_date:
        extractRightSideBirthDate(toUpperAscii(text)) ||
        pickLikelyBirthDate(getLabelDateCandidates(
          toUpperAscii(text).split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean),
          ['FECHA DE NACIMIENTO', 'NACIMIENTO'],
          { maxLines: 2 },
        )) ||
        null,
    };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

async function runGeminiScan(
  files: UploadedOcrFile[],
  ocrText = '',
): Promise<{ data: Partial<DniScanData>; model: string } | null> {
  const genAI = getGenAI();
  if (!genAI || !files.length) return null;

  const prompt = `
Analiza estas imágenes de un documento de identidad español. Puede incluir anverso y reverso.
Devuelve SOLO JSON válido con este formato exacto:
{
  "first_name": null,
  "last_name": null,
  "nif_cif": null,
  "birth_date": null,
  "address_town": null,
  "address_street": null,
  "address_cp": null,
  "address_province": null,
  "address_country": null,
  "gender": null,
  "nationality": null,
  "expedition_country": null,
  "document_type": null
}

Reglas:
- birth_date en YYYY-MM-DD.
- gender solo "M" o "F".
- document_type: "DNI", "NIE" o "Pasaporte".
- nif_cif sin espacios.
- address_country y expedition_country pueden ser "España".
- No inventes datos.
- Da prioridad máxima a detectar correctamente: first_name, last_name, document_type, gender y birth_date.
- En el anverso del DNI español, la fecha de nacimiento suele estar en la parte derecha junto a la etiqueta "NACIMIENTO", normalmente en formato DD MM AAAA.
- No confundas la fecha de nacimiento con "EMISION" ni con "VALIDEZ".
- La fecha de nacimiento (birth_date) está en el ANVERSO del DNI, a la DERECHA, bajo la etiqueta "NACIMIENTO", en formato DD MM AAAA (día mes año separados por espacios). Devuélvela siempre en formato YYYY-MM-DD.
- El código postal (address_cp) son exactamente 5 dígitos que aparecen en la dirección del REVERSO del DNI, antes del nombre del municipio. Ej: "03300 Orihuela". Es OBLIGATORIO extraerlo si aparece.
- Si dudas entre dejar un campo vacío o inventarlo, déjalo vacío, EXCEPTO para birth_date y address_cp que debes intentar extraer siempre.
- Las imágenes pueden venir giradas; interprétalas igualmente.

Texto OCR auxiliar:
---
${ocrText.slice(0, 5000)}
---
`;

  const content: any[] = [{ text: prompt }];
  for (const file of files) {
    content.push({
      inlineData: {
        mimeType: file.mimetype || 'image/jpeg',
        data: fs.readFileSync(file.path, { encoding: 'base64' }),
      },
    });
  }

  for (const modelName of GEMINI_OCR_MODEL_CANDIDATES) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: content }],
          generationConfig: {
            temperature: 0.05,
            topP: 0.8,
            topK: 20,
            responseMimeType: 'application/json',
          },
        } as any);
        const raw = result.response.text().trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();

        const parsed = JSON.parse(raw);
        return {
          model: modelName,
          data: {
            first_name: cleanupName(parsed.first_name),
            last_name: cleanupName(parsed.last_name),
            nif_cif: normalizeNifNie(parsed.nif_cif),
            birth_date: parseDateCandidate(parsed.birth_date),
            address_town: smartTitleCase(parsed.address_town),
            address_street: smartTitleCase(parsed.address_street),
            address_cp: parsed.address_cp ? String(parsed.address_cp).replace(/\D/g, '').slice(0, 5) : null,
            address_province: smartTitleCase(parsed.address_province),
            address_country: smartTitleCase(parsed.address_country),
            gender: normalizeGender(parsed.gender),
            nationality: smartTitleCase(parsed.nationality),
            expedition_country: smartTitleCase(parsed.expedition_country),
            document_type: parsed.document_type || null,
          },
        };
      } catch (error: any) {
        console.warn(`[ocr] Gemini OCR no disponible (${modelName}):`, error.message);
        if (attempt < 2 && isRetryableGeminiError(error)) {
          await wait(1200 * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }

  return null;
}

async function runOpenAIScan(
  files: UploadedOcrFile[],
  ocrText = '',
): Promise<{ data: Partial<DniScanData>; model: string } | null> {
  if (!openaiClient || !files.length) return null;

  const imageMessages: OpenAI.Chat.ChatCompletionContentPart[] = files.map((file) => ({
    type: 'image_url',
    image_url: {
      url: `data:${file.mimetype || 'image/jpeg'};base64,${fs.readFileSync(file.path, { encoding: 'base64' })}`,
      detail: 'high',
    },
  }));

  const prompt = `
Analiza estas imágenes de un documento de identidad español. Puede incluir anverso y reverso.
Devuelve SOLO JSON válido con este formato exacto:
{
  "first_name": null,
  "last_name": null,
  "nif_cif": null,
  "birth_date": null,
  "address_town": null,
  "address_street": null,
  "address_cp": null,
  "address_province": null,
  "address_country": null,
  "gender": null,
  "nationality": null,
  "expedition_country": null,
  "document_type": null
}

Reglas:
- birth_date en YYYY-MM-DD.
- gender solo "M" o "F".
- document_type: "DNI", "NIE" o "Pasaporte".
- nif_cif sin espacios.
- address_country y expedition_country pueden ser "España".
- No inventes datos.
- Da prioridad máxima a detectar correctamente: first_name, last_name, document_type, gender, birth_date, nif_cif y address_cp.
- En el anverso del DNI español, la fecha de nacimiento (birth_date) está en la parte DERECHA bajo la etiqueta "NACIMIENTO", en formato DD MM AAAA. Devuélvela en YYYY-MM-DD. NUNCA la confundas con "EMISION" ni "VALIDEZ".
- El código postal (address_cp) son 5 dígitos en la dirección del reverso del DNI, antes del municipio. Ej: "03300 Orihuela" → address_cp = "03300".
- Si ves MRZ o texto manuscrito útil, aprovéchalo.
- Si dudas entre dejar un campo vacío o inventarlo, déjalo vacío, EXCEPTO birth_date y address_cp que debes extraer si son visibles.

Texto OCR auxiliar:
---
${ocrText.slice(0, 5000)}
---
`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Eres un asistente experto en OCR documental y documentos de identidad españoles.' },
          { role: 'user', content: [{ type: 'text', text: prompt }, ...imageMessages] },
        ],
      });

      const raw = (response.choices[0]?.message?.content || '').trim();
      if (!raw) {
        if (attempt < 2) {
          await wait(1200 * (attempt + 1));
          continue;
        }
        return null;
      }

      const parsed = JSON.parse(raw);
      return {
        model: 'gpt-4o',
        data: {
          first_name: cleanupName(parsed.first_name),
          last_name: cleanupName(parsed.last_name),
          nif_cif: normalizeNifNie(parsed.nif_cif),
          birth_date: parseDateCandidate(parsed.birth_date),
          address_town: smartTitleCase(parsed.address_town),
          address_street: smartTitleCase(parsed.address_street),
          address_cp: parsed.address_cp ? String(parsed.address_cp).replace(/\D/g, '').slice(0, 5) : null,
          address_province: smartTitleCase(parsed.address_province),
          address_country: smartTitleCase(parsed.address_country),
          gender: normalizeGender(parsed.gender),
          nationality: smartTitleCase(parsed.nationality),
          expedition_country: smartTitleCase(parsed.expedition_country),
          document_type: parsed.document_type || null,
        },
      };
    } catch (error: any) {
      const message = String(error?.message || error || '');
      console.warn('[ocr] OpenAI OCR no disponible:', message);
      if (attempt < 2 && (message.includes('429') || message.toLowerCase().includes('overload') || message.toLowerCase().includes('try again'))) {
        await wait(1200 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  return null;
}

async function fetchPostalCodeSuggestions(town: string, province?: string | null): Promise<string[]> {
  try {
    const query = province ? `${town}, ${province}, España` : `${town}, España`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=es`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'VantiaERP/1.0 (lextech-erp)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as any[];
    const codes = new Set<string>();
    for (const item of data) {
      const postcode = String(item?.address?.postcode || '').trim();
      if (postcode && isSpanishPostalCode(postcode)) codes.add(postcode);
    }
    return Array.from(codes).slice(0, 5);
  } catch {
    return [];
  }
}

function countExtractedFields(data: DniScanData) {
  return Object.values(data).filter(Boolean).length;
}

function buildDetectedFields(
  data: DniScanData,
  sources?: Partial<Record<keyof DniScanData, string>>,
) {
  return Object.entries(data)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({
      key,
      value,
      source: sources?.[key as keyof DniScanData] || 'OCR',
    }));
}

function isFrontSideFile(file: UploadedOcrFile | undefined) {
  const field = toUpperAscii(file?.fieldname || '');
  return field.includes('FRONT') || field.includes('ANVERSO');
}

function isBackSideFile(file: UploadedOcrFile | undefined) {
  const field = toUpperAscii(file?.fieldname || '');
  return field.includes('BACK') || field.includes('REVERSO');
}

function getUploadedFiles(req: any): UploadedOcrFile[] {
  const files: UploadedOcrFile[] = [];
  const uploaded = req.files as Record<string, UploadedOcrFile[]> | UploadedOcrFile[] | undefined;

  if (Array.isArray(uploaded)) {
    files.push(...uploaded);
  } else if (uploaded && typeof uploaded === 'object') {
    Object.values(uploaded).forEach((group) => {
      if (Array.isArray(group)) files.push(...group);
    });
  }

  if (req.file) files.push(req.file);

  const unique = new Map<string, UploadedOcrFile>();
  for (const file of files) {
    if (file?.path) unique.set(file.path, file);
  }
  return Array.from(unique.values());
}

export const scanDNI = async (req: any, res: Response) => {
  const uploadedFiles = getUploadedFiles(req);
  if (!uploadedFiles.length) {
    return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
  }

  try {
    const tesseractResults = await Promise.all(uploadedFiles.map((file) => runTesseractScan(file.path)));
    const parsedFromImages = tesseractResults.map((result) => parseDNIText(result.text));
    const mergedTesseract = parsedFromImages.reduce<DniScanData>((acc, current) => mergePriorityIdentity(acc, current), EMPTY_SCAN);
    const frontSideData = parsedFromImages
      .filter((_, index) => isFrontSideFile(uploadedFiles[index]))
      .reduce<DniScanData>((acc, current) => mergePriorityIdentity(acc, current), EMPTY_SCAN);
    const backSideData = parsedFromImages
      .filter((_, index) => isBackSideFile(uploadedFiles[index]))
      .reduce<DniScanData>((acc, current) => mergePriorityIdentity(acc, current), EMPTY_SCAN);
    const avgConfidence = Math.round(
      tesseractResults.reduce((sum, current) => sum + current.confidence, 0) / Math.max(tesseractResults.length, 1),
    );
    const mergedText = tesseractResults.map((result, index) => {
      const label = uploadedFiles[index]?.fieldname || path.basename(uploadedFiles[index]?.path || `imagen-${index + 1}`);
      return `[${label}]\n${result.text}`;
    }).join('\n\n');
    // Escaneo enfocado de fecha de nacimiento: preferir anverso marcado, pero si no existe intentar todos los archivos
    const frontFile = uploadedFiles.find(isFrontSideFile);
    const birthScanFiles = frontFile ? [frontFile] : uploadedFiles;
    const birthFocusedResults = await Promise.all(birthScanFiles.map(f => runTesseractBirthDateScan(f.path)));
    const frontBirthFocused = {
      birth_date: pickLikelyBirthDate(
        birthFocusedResults.map(r => r.birth_date).filter((d): d is string => Boolean(d)),
      ),
    };

    const openAiResult = await runOpenAIScan(uploadedFiles, mergedText);
    const geminiResult = await runGeminiScan(uploadedFiles, mergedText);
    const visualParsed = mergePriorityIdentity(
      openAiResult?.data ? mergePriorityIdentity(EMPTY_SCAN, openAiResult.data) : EMPTY_SCAN,
      geminiResult?.data || {},
    );

    let extracted = mergePriorityIdentity(mergedTesseract, visualParsed);
    extracted = {
      ...EMPTY_SCAN,
      ...extracted,
      nif_cif: normalizeNifNie(extracted.nif_cif),
      birth_date: parseDateCandidate(extracted.birth_date),
      gender: normalizeGender(extracted.gender),
      first_name: cleanupName(extracted.first_name),
      last_name: cleanupName(extracted.last_name),
      address_town: smartTitleCase(extracted.address_town),
      address_street: smartTitleCase(extracted.address_street),
      address_cp: extracted.address_cp ? String(extracted.address_cp).replace(/\D/g, '').slice(0, 5) : null,
      address_province: smartTitleCase(extracted.address_province),
      address_country: smartTitleCase(extracted.address_country || 'España'),
      nationality: smartTitleCase(extracted.nationality),
      expedition_country: smartTitleCase(extracted.expedition_country || 'España'),
      document_type: extracted.document_type || 'DNI',
    };
    extracted = {
      ...extracted,
      birth_date: pickBest(
        frontBirthFocused?.birth_date,
        frontSideData.birth_date,
        visualParsed.birth_date,
        extracted.birth_date,
      ),
      first_name: pickBest(
        frontSideData.first_name,
        visualParsed.first_name,
        extracted.first_name,
      ),
      last_name: pickBest(
        frontSideData.last_name,
        visualParsed.last_name,
        extracted.last_name,
      ),
      address_street: pickBest(
        backSideData.address_street,
        visualParsed.address_street,
        extracted.address_street,
      ),
      address_town: pickBest(
        backSideData.address_town,
        visualParsed.address_town,
        extracted.address_town,
      ),
      address_province: pickBest(
        backSideData.address_province,
        visualParsed.address_province,
        extracted.address_province,
      ),
      address_cp: pickBest(
        backSideData.address_cp,
        visualParsed.address_cp,
        extracted.address_cp,
      ),
    };

    // Si no se detectó CP pero sí la población, buscar sugerencias por Nominatim
    let cpSuggestions: string[] = [];
    if (!extracted.address_cp && extracted.address_town) {
      cpSuggestions = await fetchPostalCodeSuggestions(extracted.address_town, extracted.address_province);
      // Si solo hay una opción, rellenar automáticamente
      if (cpSuggestions.length === 1) {
        extracted = { ...extracted, address_cp: cpSuggestions[0] };
      }
    }

    const fieldSources = Object.keys(extracted).reduce<Partial<Record<keyof DniScanData, string>>>((acc, key) => {
      const typedKey = key as keyof DniScanData;
      const value = extracted[typedKey];
      if (!value) return acc;
      if (typedKey === 'birth_date' && frontBirthFocused?.birth_date && value === frontBirthFocused.birth_date) {
        acc[typedKey] = 'OCR anverso enfocado';
        return acc;
      }
      if (frontSideData[typedKey] && (typedKey === 'birth_date' || typedKey === 'first_name' || typedKey === 'last_name')) {
        acc[typedKey] = 'OCR anverso';
        return acc;
      }
      if (backSideData[typedKey] && (typedKey === 'address_street' || typedKey === 'address_town' || typedKey === 'address_cp' || typedKey === 'address_province')) {
        acc[typedKey] = 'OCR reverso';
        return acc;
      }
      if (openAiResult?.data?.[typedKey]) {
        acc[typedKey] = 'OpenAI vision';
        return acc;
      }
      if (geminiResult?.data?.[typedKey]) {
        acc[typedKey] = 'Gemini vision';
        return acc;
      }
      acc[typedKey] = typedKey === 'nif_cif' || typedKey === 'birth_date' || typedKey === 'first_name' || typedKey === 'last_name'
        ? 'OCR / MRZ'
        : 'OCR';
      return acc;
    }, {});

    return res.json({
      success: true,
      data: extracted,
      meta: {
        source: openAiResult?.data
          ? geminiResult?.data
            ? 'OpenAI + Gemini + Tesseract'
            : 'OpenAI + Tesseract'
          : geminiResult?.data
            ? 'Gemini + Tesseract'
            : 'Tesseract',
        confidence: avgConfidence,
        fieldCount: countExtractedFields(extracted),
        usedGemini: Boolean(geminiResult?.data),
        usedAi: Boolean(openAiResult?.data || geminiResult?.data),
        scannedSides: uploadedFiles.length,
        detectedFields: buildDetectedFields(extracted, fieldSources),
        model: openAiResult?.model || geminiResult?.model || null,
        address_cp_suggestions: cpSuggestions,
      },
    });
  } catch (error: any) {
    console.error('Ã¢ÂÅ’ Error OCR DNI:', error.message);
    return res.status(500).json({
      success: false,
      error: 'No se pudieron procesar las imágenes del DNI. Prueba con fotos más nítidas, rectas y bien iluminadas.',
    });
  } finally {
    for (const file of uploadedFiles) {
      try { fs.unlinkSync(file.path); } catch { /**/ }
    }
  }
};
