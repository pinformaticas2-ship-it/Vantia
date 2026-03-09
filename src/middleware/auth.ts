import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

// Middleware estricto: Bloquea si no hay token válido
export const requireAuth = ClerkExpressRequireAuth({
  // Opciones adicionales si fueran necesarias
});