/**
 * Helper para llamadas a la API.
 * Detecta respuestas HTML (backend caído), errores 401 (sesión expirada)
 * y lanza mensajes claros en cada caso.
 */
export async function safeJson(response: Response) {
  // Token expirado / sesión inválida
  if (response.status === 401) {
    throw new Error("Sesión no válida o expirada — el token se ha renovado, reintentando…");
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const statusMsg =
      response.status === 404
        ? `Ruta no encontrada (404)`
        : response.status === 502 || response.status === 503 || response.status === 0
          ? `Backend no disponible — verifica que el servidor esté corriendo en el puerto 4000`
          : `Error del servidor (${response.status})`;

    throw new Error(statusMsg);
  }

  return response.json();
}

/**
 * Realiza un fetch autenticado con reintento automático en caso de 401.
 *
 * Uso:
 *   const data = await apiFetch("/api/entities", { getToken });
 *   const data = await apiFetch("/api/entities", { getToken, method: "POST", body: JSON.stringify(payload) });
 */
export async function apiFetch(
  url: string,
  {
    getToken,
    ...init
  }: RequestInit & { getToken: (opts?: { skipCache?: boolean }) => Promise<string | null> }
): Promise<any> {
  // Primer intento con token cacheado fresco (skipCache evita tokens a punto de expirar)
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken({ skipCache: attempt > 0 });

    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });

    // En el primer intento, si hay 401 hacemos un segundo intento con token forzado
    if (res.status === 401 && attempt === 0) continue;

    return safeJson(res);
  }
}
