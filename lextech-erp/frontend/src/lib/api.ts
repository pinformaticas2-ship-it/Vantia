let _clientIp: string | null = null;
let _ipPromise: Promise<string | null> | null = null;
const DEVICE_ID_KEY = 'lextech_device_id';
const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '';
const RAW_UPLOADS_BASE_URL = import.meta.env.VITE_UPLOADS_BASE_URL?.trim() || '';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  return stripTrailingSlash(RAW_API_BASE_URL);
}

export function getUploadsBaseUrl(): string {
  return stripTrailingSlash(RAW_UPLOADS_BASE_URL || RAW_API_BASE_URL);
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

export function installBackendFetchShim(): void {
  if (typeof window === 'undefined') return;
  const anyWindow = window as typeof window & { __vantiaFetchShimInstalled?: boolean };
  if (anyWindow.__vantiaFetchShimInstalled) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      return originalFetch(resolveApiUrl(input), init);
    }
    if (input instanceof URL) {
      const resolved = resolveApiUrl(input.toString());
      return originalFetch(new URL(resolved), init);
    }
    if (input instanceof Request) {
      const resolved = resolveApiUrl(input.url);
      if (resolved === input.url) return originalFetch(input, init);
      const proxied = new Request(resolved, input);
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

export async function safeJson(response: Response) {
  if (response.status === 401) {
    throw new Error('Sesion no valida o expirada; el token se ha renovado, reintentando...');
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const statusMsg =
      response.status === 404
        ? 'Ruta no encontrada (404)'
        : response.status === 502 || response.status === 503 || response.status === 0
          ? 'Backend no disponible; verifica que el servidor este corriendo en el puerto 4000'
          : `Error del servidor (${response.status})`;

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

      return safeJson(res);
    }
  };

  const promise = doFetch();

  if (method === 'GET') {
    inflightGET.set(url, promise);
    promise.finally(() => inflightGET.delete(url));
  }

  return promise;
}
