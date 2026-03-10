/**
 * Helper para llamadas a la API.
 * Si el servidor devuelve HTML (backend caído, 404, etc.)
 * lanza un error claro en lugar del críptico "Unexpected token '<'".
 */
export async function safeJson(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    // El servidor devolvió HTML — probablemente el backend no está corriendo
    const statusMsg = response.status === 404
      ? `Ruta no encontrada (404)`
      : response.status === 502 || response.status === 503 || response.status === 0
        ? `Backend no disponible — verifica que el servidor esté corriendo en el puerto 4000`
        : `Error del servidor (${response.status})`;

    throw new Error(statusMsg);
  }

  return response.json();
}
