import rateLimit from 'express-rate-limit';

// ── Límites de peticiones ─────────────────────────────────────────────────────
// express-rate-limit ya estaba en package.json pero no se usaba en ningún
// sitio. Dos límites concretos, a propósito NO uno genérico para toda la API:
// el resto de endpoints tienen sondeo legítimo bastante frecuente (la
// campana de notificaciones, el contador de chat, el latido de presencia),
// y un límite global mal calibrado los rompería. Se limita justo lo que
// tiene sentido limitar: lo que cuesta dinero por petición, y lo que es
// público sin sesión.

// VantIA llama a la API de Gemini en cada mensaje -- cada petición cuesta
// dinero de verdad. Se limita por usuario (Clerk), no por IP, para no
// castigar a una oficina entera detrás de la misma IP.
export const vantiaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.auth?.userId || req.ip,
  message: { success: false, error: 'Demasiados mensajes seguidos a VantIA. Espera un momento y vuelve a intentarlo.' },
});

// Formularios públicos (reserva de cita, alta de cliente por enlace) --
// accesibles sin sesión por diseño, así que solo la IP los identifica.
// Uso normal es "una persona rellena esto una vez"; 20 en 10 minutos deja
// margen de sobra para reintentos y errores de escritura sin abrir la
// puerta a automatizar envíos masivos.
export const publicFormLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.' },
});
