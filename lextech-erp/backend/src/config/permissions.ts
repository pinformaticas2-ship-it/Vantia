import pool from './database';

// ── Permisos por módulo ──────────────────────────────────────────────────────
// Antes solo existía un nivel "admin" (propietario/admin) que daba acceso a
// TODO lo restringido a la vez (Tesorería, gestionar la organización...) sin
// matices, y un rol "informático/soporte" no tenía dónde encajar: o acceso
// total, o el mismo acceso a Clientes/Expedientes que un abogado, cuando no
// lo necesita. Esto sustituye ese todo-o-nada por una matriz rol × módulo con
// tres niveles, configurable por el propietario desde Configuración →
// Gestión de Usuarios → Roles y permisos.

export type OrgRol = 'propietario' | 'admin' | 'miembro' | 'soporte';

export type Modulo =
  | 'clientes' | 'expedientes' | 'agenda' | 'tareas' | 'chat'
  | 'correo' | 'whatsapp' | 'documental' | 'directorio' | 'facturacion';

export type NivelAcceso = 'ninguno' | 'lectura' | 'edicion';

export const MODULOS: { id: Modulo; label: string }[] = [
  { id: 'clientes',    label: 'Clientes' },
  { id: 'expedientes', label: 'Expedientes' },
  { id: 'agenda',      label: 'Agenda' },
  { id: 'tareas',      label: 'Tareas' },
  { id: 'chat',        label: 'Chat interno' },
  { id: 'correo',      label: 'Correo' },
  { id: 'whatsapp',    label: 'Comunicación externa' },
  { id: 'documental',  label: 'Documental' },
  { id: 'directorio',  label: 'Directorio profesional' },
  { id: 'facturacion', label: 'Tesorería' },
];

const ROLES: OrgRol[] = ['propietario', 'admin', 'miembro', 'soporte'];

const NIVEL_RANK: Record<NivelAcceso, number> = { ninguno: 0, lectura: 1, edicion: 2 };
export function nivelCubre(nivel: NivelAcceso, requerido: NivelAcceso): boolean {
  return NIVEL_RANK[nivel] >= NIVEL_RANK[requerido];
}

// Matriz de fábrica. propietario/admin/miembro se quedan exactamente como
// funcionaba la app hasta ahora -- salvo Tesorería, que ya era solo para
// propietario/admin antes de que existiera esta matriz (requireAdmin), así
// que "miembro" mantiene ese mismo "ninguno" de fábrica; el propietario
// puede concederle acceso desde Roles y permisos sin tener que ascenderlo a
// admin de toda la organización. El único comportamiento nuevo por defecto
// es que "soporte" no ve ninguno de estos módulos, porque su terreno es
// Configuración/usuarios/integraciones, no los datos de clientes.
export const DEFAULT_PERMISSIONS: Record<OrgRol, Record<Modulo, NivelAcceso>> = {
  propietario: Object.fromEntries(MODULOS.map((m) => [m.id, 'edicion'])) as Record<Modulo, NivelAcceso>,
  admin:       Object.fromEntries(MODULOS.map((m) => [m.id, 'edicion'])) as Record<Modulo, NivelAcceso>,
  miembro: {
    ...(Object.fromEntries(MODULOS.map((m) => [m.id, 'edicion'])) as Record<Modulo, NivelAcceso>),
    facturacion: 'ninguno',
  },
  // "chat" (el chat interno del equipo, no el de clientes) se deja abierto de
  // fábrica: es la herramienta con la que el soporte técnico habla con el
  // resto del despacho, no tiene el mismo problema de secreto profesional
  // que el resto de módulos con datos de clientes.
  soporte: {
    ...(Object.fromEntries(MODULOS.map((m) => [m.id, 'ninguno'])) as Record<Modulo, NivelAcceso>),
    chat: 'edicion',
  },
};

export async function resolvePermission(organizacionId: string, rol: string, modulo: Modulo): Promise<NivelAcceso> {
  const orgRol = ROLES.includes(rol as OrgRol) ? (rol as OrgRol) : 'miembro';
  try {
    const { rows } = await pool.query(
      `SELECT nivel FROM organizacion_permisos WHERE organizacion_id = $1 AND rol = $2 AND modulo = $3`,
      [organizacionId, orgRol, modulo],
    );
    if (rows[0]?.nivel) return rows[0].nivel as NivelAcceso;
  } catch { /* si falla la consulta, se cae al valor por defecto */ }
  return DEFAULT_PERMISSIONS[orgRol][modulo];
}

// Matriz completa (por defecto + desviaciones guardadas) para pintar la
// pantalla de "Roles y permisos".
export async function getFullMatrix(organizacionId: string): Promise<Record<OrgRol, Record<Modulo, NivelAcceso>>> {
  const matrix: Record<OrgRol, Record<Modulo, NivelAcceso>> = {
    propietario: { ...DEFAULT_PERMISSIONS.propietario },
    admin:       { ...DEFAULT_PERMISSIONS.admin },
    miembro:     { ...DEFAULT_PERMISSIONS.miembro },
    soporte:     { ...DEFAULT_PERMISSIONS.soporte },
  };
  const { rows } = await pool.query(
    `SELECT rol, modulo, nivel FROM organizacion_permisos WHERE organizacion_id = $1`,
    [organizacionId],
  );
  for (const r of rows) {
    if (ROLES.includes(r.rol) && matrix[r.rol as OrgRol] && r.modulo in matrix[r.rol as OrgRol]) {
      matrix[r.rol as OrgRol][r.modulo as Modulo] = r.nivel as NivelAcceso;
    }
  }
  return matrix;
}

// Todos los permisos resueltos para UN rol concreto (lo que consume el
// frontend para saber qué mostrar/ocultar del propio usuario que ha entrado).
export async function getRolPermissions(organizacionId: string, rol: string): Promise<Record<Modulo, NivelAcceso>> {
  const full = await getFullMatrix(organizacionId);
  const orgRol = ROLES.includes(rol as OrgRol) ? (rol as OrgRol) : 'miembro';
  return full[orgRol];
}

export async function setPermissionOverride(organizacionId: string, rol: OrgRol, modulo: Modulo, nivel: NivelAcceso): Promise<void> {
  if (DEFAULT_PERMISSIONS[rol][modulo] === nivel) {
    // Coincide con el valor de fábrica -- no hace falta guardar una fila,
    // así la tabla se queda vacía mientras nadie personalice nada.
    await pool.query(`DELETE FROM organizacion_permisos WHERE organizacion_id=$1 AND rol=$2 AND modulo=$3`, [organizacionId, rol, modulo]);
    return;
  }
  await pool.query(
    `INSERT INTO organizacion_permisos (organizacion_id, rol, modulo, nivel)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organizacion_id, rol, modulo) DO UPDATE SET nivel = EXCLUDED.nivel, updated_at = NOW()`,
    [organizacionId, rol, modulo, nivel],
  );
}

// ── Excepciones por miembro concreto ──────────────────────────────────────────
// El propietario nunca pasa por aquí -- siempre tiene acceso completo a todo
// por definición (transferir la propiedad es la única forma de quitárselo),
// así que ni se consulta ni se deja guardar una excepción para él.
export async function resolveEffectivePermission(organizacionId: string, userId: string, rol: string, modulo: Modulo): Promise<NivelAcceso> {
  if (rol === 'propietario' || !userId) return resolvePermission(organizacionId, rol, modulo);
  try {
    const { rows } = await pool.query(
      `SELECT nivel FROM organizacion_miembro_permisos WHERE organizacion_id=$1 AND user_id=$2 AND modulo=$3`,
      [organizacionId, userId, modulo],
    );
    if (rows[0]?.nivel) return rows[0].nivel as NivelAcceso;
  } catch { /* si falla la consulta, se cae al nivel de su rol */ }
  return resolvePermission(organizacionId, rol, modulo);
}

// Matriz completa de UN miembro (lo que ya le da su rol, con las excepciones
// propias ya aplicadas) + qué módulos tiene personalizados, para pintar y
// editar la pantalla de permisos individuales.
export async function getMemberMatrix(
  organizacionId: string, userId: string, rol: string,
): Promise<{ matriz: Record<Modulo, NivelAcceso>; personalizados: Modulo[] }> {
  const rolMatrix = await getRolPermissions(organizacionId, rol);
  const matriz: Record<Modulo, NivelAcceso> = { ...rolMatrix };
  const personalizados: Modulo[] = [];

  if (rol !== 'propietario') {
    const { rows } = await pool.query(
      `SELECT modulo, nivel FROM organizacion_miembro_permisos WHERE organizacion_id=$1 AND user_id=$2`,
      [organizacionId, userId],
    );
    for (const r of rows) {
      if (MODULOS.some((m) => m.id === r.modulo)) {
        matriz[r.modulo as Modulo] = r.nivel as NivelAcceso;
        personalizados.push(r.modulo as Modulo);
      }
    }
  }
  return { matriz, personalizados };
}

export async function setMemberPermissionOverride(
  organizacionId: string, userId: string, rol: string, modulo: Modulo, nivel: NivelAcceso,
): Promise<void> {
  const nivelDeSuRol = await resolvePermission(organizacionId, rol, modulo);
  if (nivelDeSuRol === nivel) {
    // Vuelve a coincidir con lo que ya le daba su rol -- se borra la
    // excepción en vez de guardar una fila redundante.
    await pool.query(
      `DELETE FROM organizacion_miembro_permisos WHERE organizacion_id=$1 AND user_id=$2 AND modulo=$3`,
      [organizacionId, userId, modulo],
    );
    return;
  }
  await pool.query(
    `INSERT INTO organizacion_miembro_permisos (organizacion_id, user_id, modulo, nivel)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organizacion_id, user_id, modulo) DO UPDATE SET nivel = EXCLUDED.nivel, updated_at = NOW()`,
    [organizacionId, userId, modulo, nivel],
  );
}

export async function clearMemberPermissionOverrides(organizacionId: string, userId: string): Promise<void> {
  await pool.query(
    `DELETE FROM organizacion_miembro_permisos WHERE organizacion_id=$1 AND user_id=$2`,
    [organizacionId, userId],
  );
}
