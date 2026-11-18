import { idioma } from './i18n';

// Estado del cliente en el idioma de la app (17/11/2026). No usa t(): en el
// diccionario «Alta»/«Baja» son también los botones «Add»/«Remove», y el
// estado debe decir «Active»/«Inactive». En la base de datos sigue en español.
const EN: Record<string, string> = {
  alta: 'Active', activo: 'Active', baja: 'Inactive', inactivo: 'Inactive',
  potencial: 'Prospective', pendiente: 'Pending',
};

export function estadoCliente(valor: string | null | undefined): string {
  const v = String(valor ?? '');
  return idioma() === 'en' ? EN[v.trim().toLowerCase()] ?? v : v;
}
