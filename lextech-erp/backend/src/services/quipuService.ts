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

function buildOwnerPath(settings: QuipuStoredSettings, path: string): string {
  const ownerSlug = normalizeOwnerSlug(settings.owner_slug);
  const cleanPath = String(path || '').trim();
  return `/${ownerSlug}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function parseQuipuResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let parsed: any = null;

  if (text) {
    try { parsed = JSON.parse(text); }
    catch { parsed = text; }
  }

  if (!response.ok) {
    const detail =
      parsed?.errors?.[0]?.detail ||
      parsed?.error_description ||
      parsed?.error ||
      parsed?.message ||
      `Quipu respondió con ${response.status}: ${text?.slice(0, 200)}`;
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
): Promise<T> {
  // Reuse provided token; only request a new one if not given
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
  return parseQuipuResponse(response);
}

export async function quipuOwnerFetch<T = any>(
  settings: QuipuStoredSettings,
  path: string,
  init?: RequestInit,
  preAuthToken?: string,
): Promise<T> {
  return quipuApiFetch<T>(settings, buildOwnerPath(settings, path), init, preAuthToken);
}

// ── Paginated list — token shared across pages ────────────────
export async function fetchQuipuPaginatedList<T = any>(
  settings: QuipuStoredSettings,
  path: string,
  preAuthToken?: string,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let totalPages = 1;

  // Get token once for all pages
  const token = preAuthToken || await getValidToken(settings);

  while (page <= totalPages) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await quipuOwnerFetch<any>(
      settings,
      `${path}${separator}page[number]=${page}`,
      undefined,
      token,
    );
    const rows = Array.isArray(response?.data) ? response.data : [];
    results.push(...rows);

    const pagination = response?.meta?.pagination_info || {};
    totalPages = Math.max(Number(pagination.total_pages || 1), 1);
    page += 1;

    // Respect 5 req / 5 sec limit
    if (page <= totalPages) await sleep(1100);
  }

  return results;
}

// ── Bootstrap: ONE token, sequential fetches ─────────────────
export async function fetchQuipuBootstrap(settings: QuipuStoredSettings) {
  // Request token ONCE — all list calls share it
  const { accessToken } = await requestQuipuToken(settings);

  // Sequential fetches to avoid hitting the 5 req/5s rate limit
  const contacts = await fetchQuipuPaginatedList<any>(
    settings, '/contactos?filter[kind]=client', accessToken,
  );
  await sleep(1200);

  const invoices = await fetchQuipuPaginatedList<any>(
    settings, '/invoices?sort=-issued_at', accessToken,
  );
  await sleep(1200);

  const numberingSeries = await fetchQuipuPaginatedList<any>(
    settings, '/numbering_series', accessToken,
  );
  await sleep(1200);

  // Bank accounts — fail silently if not available in this Quipu plan
  let bankAccounts: any[] = [];
  try {
    bankAccounts = await fetchQuipuPaginatedList<any>(settings, '/bank_accounts', accessToken);
  } catch { /* treasury module may not be in this plan */ }

  return { contacts, invoices, numberingSeries, bankAccounts };
}

export function summarizeQuipuBootstrap(data: {
  contacts: any[];
  invoices: any[];
  numberingSeries: any[];
  bankAccounts?: any[];
}) {
  return {
    contacts: data.contacts.length,
    invoices: data.invoices.length,
    numberingSeries: data.numberingSeries.length,
    bankAccounts: (data.bankAccounts || []).length,
    syncedAt: new Date().toISOString(),
  };
}
