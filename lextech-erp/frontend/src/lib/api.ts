let _clientIp: string | null = null;
let _ipPromise: Promise<string | null> | null = null;
const DEVICE_ID_KEY = 'lextech_device_id';
function ensureProtocol(url: string): string {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return 'https://' + url;
}

const RAW_API_BASE_URL = ensureProtocol(import.meta.env.VITE_API_BASE_URL?.trim() || '');
const RAW_UPLOADS_BASE_URL = ensureProtocol(import.meta.env.VITE_UPLOADS_BASE_URL?.trim() || '');
const DEFAULT_PRODUCTION_BACKEND_BASE_URL = 'https://vantia.up.railway.app';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getHostedBackendFallback(): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname.toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  return isLocal ? '' : DEFAULT_PRODUCTION_BACKEND_BASE_URL;
}

export function getApiBaseUrl(): string {
  const base = RAW_API_BASE_URL || getHostedBackendFallback();
  return stripTrailingSlash(base);
}

export function getUploadsBaseUrl(): string {
  const base = RAW_UPLOADS_BASE_URL || RAW_API_BASE_URL || getHostedBackendFallback();
  return stripTrailingSlash(base);
}

export function resolveApiUrl(input: string): string {
  if (!input.startsWith('/api/')) return input;
  const base = getApiBaseUrl();
  return base ? `${base}${input}` : input;
}

export function resolveUploadUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  if (/^https?:\/\//i.test(input) || input.startsWith('blob:') || input.startsWith('data:')) {
    return input;
  }
  if (!input.startsWith('/uploads/')) return input;
  const base = getUploadsBaseUrl();
  return base ? `${base}${input}` : input;
}

function normalizeBackendPayload<T>(value: T): T {
  if (typeof value === 'string') {
    return resolveUploadUrl(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeBackendPayload(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeBackendPayload(item)])
    ) as T;
  }
  return value;
}

const ACTIVE_ORG_KEY = 'vantia_active_org_id';

// Clave de localStorage acotada por usuario de Clerk -- si dos personas
// comparten el mismo navegador (frecuente en despachos pequeños), sin esto
// la organización elegida por una se filtraría a la sesión de la otra
// (mismo tipo de bug ya corregido antes para WhatsApp/Email unread state).
// window.Clerk lo expone @clerk/clerk-react fuera de React, así que esto
// funciona aunque esta función no sea un hook.
function activeOrgStorageKey(): string {
  const userId = (window as any).Clerk?.user?.id;
  return userId ? `${ACTIVE_ORG_KEY}-${userId}` : ACTIVE_ORG_KEY;
}

// Organización activa elegida con el selector del sidebar ("Seleccionar
// empresa"). El backend (middleware resolveOrg) solo la respeta si el
// usuario es realmente miembro de esa organización -- esto es solo para
// indicar la preferencia, nunca es la barrera de seguridad real.
export function getActiveOrganizacionId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(activeOrgStorageKey());
}

export function setActiveOrganizacionId(id: string | null): void {
  if (typeof window === 'undefined') return;
  const key = activeOrgStorageKey();
  if (id) window.localStorage.setItem(key, id);
  else window.localStorage.removeItem(key);
}

function isApiUrl(url: string): boolean {
  return url.includes('/api/');
}

function withOrgHeader(init: RequestInit | undefined, url: string): RequestInit | undefined {
  const orgId = getActiveOrganizacionId();
  if (!orgId || !isApiUrl(url)) return init;

  const headers = new Headers(init?.headers);
  headers.set('X-Organizacion-Id', orgId);
  return { ...init, headers };
}

export function installBackendFetchShim(): void {
  if (typeof window === 'undefined') return;
  const anyWindow = window as typeof window & { __vantiaFetchShimInstalled?: boolean };
  if (anyWindow.__vantiaFetchShimInstalled) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      const resolved = resolveApiUrl(input);
      return originalFetch(resolved, withOrgHeader(init, resolved));
    }
    if (input instanceof URL) {
      const resolved = resolveApiUrl(input.toString());
      return originalFetch(new URL(resolved), withOrgHeader(init, resolved));
    }
    if (input instanceof Request) {
      const resolved = resolveApiUrl(input.url);
      const proxied = resolved === input.url ? input : new Request(resolved, input);
      const orgId = getActiveOrganizacionId();
      if (orgId && isApiUrl(resolved)) {
        const headers = new Headers(proxied.headers);
        headers.set('X-Organizacion-Id', orgId);
        return originalFetch(new Request(proxied, { headers }), init);
      }
      return originalFetch(proxied, init);
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;

  anyWindow.__vantiaFetchShimInstalled = true;
}

function createDeviceId(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now().toString(36)}-${suffix}`;
}

export function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = createDeviceId();
  window.localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

function getLocalNetworkIp(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      const found: string[] = [];

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          pc.close();
          const priv = found.find((ip) =>
            ip.startsWith('192.168.') ||
            ip.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
          );
          resolve(priv ?? found[0] ?? null);
          return;
        }

        const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(e.candidate.candidate);
        if (match && !match[1].startsWith('127.') && !found.includes(match[1])) {
          found.push(match[1]);
        }
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          pc.close();
          resolve(null);
        });

      setTimeout(() => {
        pc.close();
        resolve(found[0] ?? null);
      }, 3000);
    } catch {
      resolve(null);
    }
  });
}

export function initClientIp(): void {
  _ipPromise = Promise.all([
    getLocalNetworkIp(),
    fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) })
      .then((r) => r.json())
      .then((d): string | null => d?.ip ?? null)
      .catch((): null => null),
  ])
    .then(([localIp, publicIp]): string | null => {
      _clientIp = localIp ?? publicIp ?? null;
      return _clientIp;
    })
    .catch((): null => null);
}

export async function waitForClientIp(): Promise<string | null> {
  if (_clientIp) return _clientIp;
  if (_ipPromise) return _ipPromise;
  return null;
}

export function getClientIp(): string | null {
  return _clientIp;
}

export async function safeJson(response: Response, options?: { authRetried?: boolean }) {
  if (response.status === 401) {
    throw new Error(
      options?.authRetried
        ? 'Sesion no valida o expirada. El backend no ha aceptado la autenticacion.'
        : 'Sesion no valida o expirada; reintentando con un token renovado...',
    );
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const simplifiedUrl = response.url || 'ruta desconocida';
    const statusMsg =
      response.status === 404
        ? `Ruta no encontrada (404): ${simplifiedUrl}`
        : response.status === 405
          ? `Metodo no permitido (405): ${simplifiedUrl}`
        : response.status === 502 || response.status === 503 || response.status === 0
          ? `Backend no disponible: ${simplifiedUrl}`
          : `Error del servidor (${response.status}) en ${simplifiedUrl} [content-type=${contentType || 'desconocido'}]`;

    throw new Error(statusMsg);
  }

  const data = await response.json();
  return normalizeBackendPayload(data);
}

const inflightGET = new Map<string, Promise<any>>();

export async function apiFetch(
  url: string,
  {
    getToken,
    ...init
  }: RequestInit & { getToken: (opts?: { skipCache?: boolean }) => Promise<string | null> }
): Promise<any> {
  const method = (init.method || 'GET').toUpperCase();

  if (method === 'GET' && inflightGET.has(url)) {
    return inflightGET.get(url)!;
  }

  const doFetch = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getToken({ skipCache: attempt > 0 });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      if (_clientIp) headers['x-client-ip'] = _clientIp;
      headers['x-device-id'] = getDeviceId();

      const extra = init.headers;
      if (extra) {
        if (extra instanceof Headers) {
          extra.forEach((v, k) => {
            headers[k] = v;
          });
        } else if (Array.isArray(extra)) {
          (extra as [string, string][]).forEach(([k, v]) => {
            headers[k] = v;
          });
        } else {
          Object.assign(headers, extra as Record<string, string>);
        }
      }

      const res = await fetch(resolveApiUrl(url), { ...init, headers });

      if (res.status === 401 && attempt === 0) continue;

      return safeJson(res, { authRetried: attempt > 0 });
    }
  };

  const promise = doFetch();

  if (method === 'GET') {
    inflightGET.set(url, promise);
    promise.finally(() => inflightGET.delete(url));
  }

  return promise;
}
