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
  if (!slug) {
    throw new Error('El owner_slug de Quipu es obligatorio.');
  }
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
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const detail =
      parsed?.errors?.[0]?.detail ||
      parsed?.error_description ||
      parsed?.error ||
      parsed?.message ||
      `Quipu respondió con ${response.status}`;
    throw new Error(String(detail));
  }

  if (contentType.includes('application/json') || typeof parsed === 'object') {
    return parsed;
  }

  return { raw: parsed };
}

export async function requestQuipuToken(settings: QuipuStoredSettings) {
  const baseUrl = normalizeBaseUrl(settings.base_url);
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${buildBasicAuth(settings.app_id, settings.app_secret)}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'ecommerce',
    }),
  });

  const data = await parseQuipuResponse(response);
  const expiresIn = Number(data?.expires_in || 0);
  return {
    accessToken: String(data?.access_token || ''),
    tokenType: String(data?.token_type || 'bearer'),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
  };
}

export async function quipuApiFetch<T = any>(
  settings: QuipuStoredSettings,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const tokenData = await requestQuipuToken(settings);
  const baseUrl = normalizeBaseUrl(settings.base_url);
  const headers = new Headers(init?.headers || {});

  headers.set('Authorization', `Bearer ${tokenData.accessToken}`);
  headers.set('Accept', 'application/vnd.quipu.v1+json');

  const hasBody = init?.body !== undefined && init?.body !== null;
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/vnd.quipu.v1+json');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  return parseQuipuResponse(response);
}

export async function quipuOwnerFetch<T = any>(
  settings: QuipuStoredSettings,
  path: string,
  init?: RequestInit,
): Promise<T> {
  return quipuApiFetch<T>(settings, buildOwnerPath(settings, path), init);
}

export async function fetchQuipuPaginatedList<T = any>(
  settings: QuipuStoredSettings,
  path: string,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await quipuOwnerFetch<any>(settings, `${path}${separator}page[number]=${page}`);
    const rows = Array.isArray(response?.data) ? response.data : [];
    results.push(...rows);

    const pagination = response?.meta?.pagination_info || {};
    totalPages = Math.max(Number(pagination.total_pages || 1), 1);
    page += 1;

    // Quipu limita a 5 peticiones cada 5 segundos.
    if (page <= totalPages) {
      await sleep(1100);
    }
  }

  return results;
}

export async function fetchQuipuBootstrap(settings: QuipuStoredSettings) {
  const [contacts, invoices, numberingSeries] = await Promise.all([
    fetchQuipuPaginatedList<any>(settings, '/contactos?filter[kind]=client'),
    fetchQuipuPaginatedList<any>(settings, '/invoices?sort=-issued_at'),
    fetchQuipuPaginatedList<any>(settings, '/numbering_series'),
  ]);

  return {
    contacts,
    invoices,
    numberingSeries,
  };
}

export function summarizeQuipuBootstrap(data: {
  contacts: any[];
  invoices: any[];
  numberingSeries: any[];
}) {
  return {
    contacts: data.contacts.length,
    invoices: data.invoices.length,
    numberingSeries: data.numberingSeries.length,
    syncedAt: new Date().toISOString(),
  };
}
