const DEFAULT_QUIPU_BASE_URL = 'https://getquipu.com';

export type QuipuStoredSettings = {
  app_id: string;
  app_secret: string;
  base_url?: string | null;
  owner_slug?: string | null;
  access_token?: string | null;
  token_type?: string | null;
  token_expires_at?: string | Date | null;
};

function normalizeBaseUrl(baseUrl?: string | null): string {
  const raw = String(baseUrl || DEFAULT_QUIPU_BASE_URL).trim();
  return raw.replace(/\/+$/, '');
}

function buildBasicAuth(appId: string, appSecret: string): string {
  return Buffer.from(`${appId}:${appSecret}`).toString('base64');
}

function normalizeOwnerSlug(ownerSlug?: string | null): string {
  const slug = String(ownerSlug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!slug) throw new Error('El owner_slug de Quipu es obligatorio.');
  return slug;
}

function ownerSlugCandidates(ownerSlug?: string | null): string[] {
  const normalized = normalizeOwnerSlug(ownerSlug);
  const withoutDashboardPrefix = normalized.replace(/^d\//i, '');
  const candidates = [
    normalized,
    withoutDashboardPrefix,
    `d/${withoutDashboardPrefix}`,
  ];
  return Array.from(new Set(candidates.map((slug) => slug.replace(/^\/+|\/+$/g, '')).filter(Boolean)));
}

function buildOwnerPathForSlug(ownerSlug: string, path: string): string {
  const cleanPath = String(path || '').trim();
  return `/${ownerSlug}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function formatQuipuError(error: any): string | null {
  if (!error) return null;

  const pointer = String(error?.source?.pointer || '').trim();
  const pointerField = pointer
    .replace(/^\/data\/attributes\//, '')
    .replace(/^\/data\/relationships\//, '')
    .replace(/\/data$/, '')
    .trim();
  const metaField = String(error?.meta?.attribute || error?.meta?.field || '').trim();
  const field = pointerField || metaField;
  const detail = String(error?.detail || '').trim();
  const title = String(error?.title || '').trim();

  if (field && detail) return `${field}: ${detail}`;
  if (field && title) return `${field}: ${title}`;
  if (detail) return detail;
  if (title) return title;
  return null;
}

async function parseQuipuResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let parsed: any = null;

  if (text) {
    try { parsed = JSON.parse(text); }
    catch { parsed = text; }
  }

  if (!response.ok) {
    const apiErrors = Array.isArray(parsed?.errors) ? parsed.errors : [];
    const formattedErrors = apiErrors
      .map((error: any) => formatQuipuError(error))
      .filter(Boolean);
    const detail =
      formattedErrors[0] ||
      parsed?.error_description ||
      parsed?.error ||
      parsed?.message ||
      (response.status === 404
        ? `Recurso no encontrado en Quipu (404). Verifica que el owner_slug sea correcto (ve a getquipu.com, inicia sesión y mira la URL: getquipu.com/TU-SLUG/...). URL llamada: ${response.url}`
        : `Quipu respondió con ${response.status}: ${text?.slice(0, 300)}`);
    throw new Error(String(detail));
  }

  if (contentType.includes('application/json') || typeof parsed === 'object') {
    return parsed;
  }
  return { raw: parsed };
}

// ── Token management ──────────────────────────────────────────
export async function requestQuipuToken(settings: QuipuStoredSettings) {
  const baseUrl = normalizeBaseUrl(settings.base_url);
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${buildBasicAuth(settings.app_id, settings.app_secret)}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'ecommerce' }),
  });

  const data = await parseQuipuResponse(response);
  const expiresIn = Number(data?.expires_in || 7200);
  return {
    accessToken: String(data?.access_token || ''),
    tokenType: String(data?.token_type || 'bearer'),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

// Returns the stored token if still valid (5-min buffer), otherwise requests a new one
export async function getValidToken(settings: QuipuStoredSettings): Promise<string> {
  if (settings.access_token && settings.token_expires_at) {
    const expiresAt = new Date(settings.token_expires_at as string);
    if (!isNaN(expiresAt.getTime()) && expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
      return settings.access_token;
    }
  }
  const tokenData = await requestQuipuToken(settings);
  return tokenData.accessToken;
}

// ── Core fetch with pre-fetched token support ─────────────────
export async function quipuApiFetch<T = any>(
  settings: QuipuStoredSettings,
  path: string,
  init?: RequestInit,
  preAuthToken?: string,
  _retries = 2,
): Promise<T> {
  const accessToken = preAuthToken || await getValidToken(settings);
  const baseUrl = normalizeBaseUrl(settings.base_url);
  const headers = new Headers(init?.headers || {});

  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Accept', 'application/vnd.quipu.v1+json');

  const hasBody = init?.body !== undefined && init?.body !== null;
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/vnd.quipu.v1+json');
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });

  // Auto-retry on 429 (rate limit) — Quipu asks to wait 5 seconds
  if (response.status === 429 && _retries > 0) {
    console.log(`[Quipu] 429 rate limit on ${path}, waiting 6s (retries left: ${_retries - 1})`);
    await sleep(6000);
    return quipuApiFetch<T>(settings, path, init, accessToken, _retries - 1);
  }

  return parseQuipuResponse(response);
}

export async function quipuOwnerFetch<T = any>(
  settings: QuipuStoredSettings,
  path: string,
  init?: RequestInit,
  preAuthToken?: string,
): Promise<T> {
  const candidates = ownerSlugCandidates(settings.owner_slug);
  const triedPaths: string[] = [];
  let lastError: any = null;

  for (const candidate of candidates) {
    const ownerPath = buildOwnerPathForSlug(candidate, path);
    triedPaths.push(ownerPath);
    try {
      return await quipuApiFetch<T>(settings, ownerPath, init, preAuthToken);
    } catch (error: any) {
      lastError = error;
      if (!String(error?.message || '').includes('404')) throw error;
    }
  }

  const attempts = triedPaths.map((item) => `${normalizeBaseUrl(settings.base_url)}${item}`).join(' | ');
  throw new Error(`${lastError?.message || 'Recurso no encontrado en Quipu.'} Intentos probados: ${attempts}`);
}

// ── Paginated list — token shared across pages ────────────────
export async function fetchQuipuPaginatedList<T = any>(
  settings: QuipuStoredSettings,
  path: string,
  preAuthToken?: string,
  maxPages = 20, // safety cap: never fetch more than 20 pages per endpoint
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let totalPages = 1;

  const token = preAuthToken || await getValidToken(settings);
  // Request 50 items per page (halves the number of requests vs default 25)
  const sep = path.includes('?') ? '&' : '?';
  const pathWithSize = `${path}${sep}page[size]=50`;

  while (page <= totalPages && page <= maxPages) {
    const pageSep = pathWithSize.includes('?') ? '&' : '?';
    const response = await quipuOwnerFetch<any>(
      settings,
      `${pathWithSize}${pageSep}page[number]=${page}`,
      undefined,
      token,
    );
    const rows = Array.isArray(response?.data) ? response.data : [];
    results.push(...rows);

    const pagination = response?.meta?.pagination_info || {};
    totalPages = Math.max(Number(pagination.total_pages || 1), 1);
    page += 1;

    // 1.5s between pages to stay safely under 5 req/5s limit
    if (page <= totalPages && page <= maxPages) await sleep(1500);
  }

  return results;
}

// ── Bootstrap: ONE token, sequential fetches ─────────────────
export async function fetchQuipuBootstrap(settings: QuipuStoredSettings) {
  const { accessToken } = await requestQuipuToken(settings);

  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const sinceStr = since.toISOString().slice(0, 10);

  // Each endpoint fails silently — a 429 on one section never aborts the whole bootstrap
  const safe = async (fn: () => Promise<any[]>): Promise<any[]> => {
    try { return await fn(); } catch (e: any) {
      console.warn('[Quipu] bootstrap endpoint failed (skipped):', e?.message?.slice(0, 80));
      return [];
    }
  };

  const contacts = await safe(() =>
    fetchQuipuPaginatedList<any>(settings, '/contacts', accessToken, 20));
  await sleep(2000);

  const invoices = await safe(() =>
    fetchQuipuPaginatedList<any>(settings, `/invoices?sort=-issued_at&filter[issued_at_gteq]=${sinceStr}`, accessToken, 10));
  await sleep(2000);

  const receivedInvoices = await safe(() =>
    fetchQuipuPaginatedList<any>(settings, `/received_invoices?sort=-issued_at&filter[issued_at_gteq]=${sinceStr}`, accessToken, 10));
  await sleep(2000);

  const numberingSeries = await safe(() =>
    fetchQuipuPaginatedList<any>(settings, '/numbering_series', accessToken));
  await sleep(2000);

  const bankAccounts = await safe(() =>
    fetchQuipuPaginatedList<any>(settings, '/bank_accounts', accessToken));

  return { contacts, invoices, receivedInvoices, numberingSeries, bankAccounts };
}

export function summarizeQuipuBootstrap(data: {
  contacts: any[];
  invoices: any[];
  receivedInvoices?: any[];
  numberingSeries: any[];
  bankAccounts?: any[];
}) {
  return {
    contacts: data.contacts.length,
    invoices: data.invoices.length,
    receivedInvoices: (data.receivedInvoices || []).length,
    numberingSeries: data.numberingSeries.length,
    bankAccounts: (data.bankAccounts || []).length,
    syncedAt: new Date().toISOString(),
  };
}
