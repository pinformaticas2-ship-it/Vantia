import { Request, Response } from 'express';
import { createClerkClient } from '@clerk/backend';
import pool from '../config/database';
import { resolveEffectivePermission } from '../config/permissions';
import { getClientIp } from '../utils/clientIp';

const pgErr = (e: any) =>
  `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;

export type EventType =
  | 'ACTION'
  | 'LOGIN'
  | 'LOGOUT'
  | 'SERVER_START'
  | 'AUTH_ERROR'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VIEW'
  | 'EXPORT'
  | 'UPLOAD'
  | 'DOWNLOAD';

const _nameCache = new Map<string, { name: string; exp: number }>();
const _roleCache = new Map<string, { role: string; exp: number }>();
let _clerk: ReturnType<typeof createClerkClient> | null = null;

export function getClerk() {
  if (!_clerk) _clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _clerk;
}

export async function resolveUserName(userId: string): Promise<string> {
  const hit = _nameCache.get(userId);
  if (hit && hit.exp > Date.now()) return hit.name;

  try {
    const user = await getClerk().users.getUser(userId);
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.emailAddresses?.[0]?.emailAddress ||
      userId;

    _nameCache.set(userId, { name, exp: Date.now() + 10 * 60 * 1000 });
    return name;
  } catch {
    return userId;
  }
}

// Rol guardado en publicMetadata.role (Clerk) -- fuente de verdad para
// autorización de secciones restringidas como Tesorería. Cacheado 5 min
// para no golpear la API de Clerk en cada petición; en caso de fallo se
// asume el rol más restrictivo ('user'), nunca se falla abierto a 'admin'.
export async function resolveUserRole(userId: string): Promise<string> {
  const hit = _roleCache.get(userId);
  if (hit && hit.exp > Date.now()) return hit.role;

  try {
    const user = await getClerk().users.getUser(userId);
    const role = String((user.publicMetadata as any)?.role || 'user');
    _roleCache.set(userId, { role, exp: Date.now() + 5 * 60 * 1000 });
    return role;
  } catch {
    return 'user';
  }
}

function getUA(req: Request): string {
  return (req.headers['user-agent'] || '').slice(0, 500);
}

function getDeviceId(req: Request): string | null {
  const raw = req.headers['x-device-id'];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

// De qué tabla sacar la organización según el tipo de entidad del registro.
// "CLIENT" también se usa con ids de expediente (adjuntos de expediente).
const ENTITY_ORG_SOURCES: Record<string, string[]> = {
  CLIENT: ['entities', 'expedientes'],
  CLIENTE: ['entities', 'expedientes'],
  EXPEDIENTE: ['expedientes'],
  AGENDA: ['agenda_events'],
  TASK: ['client_tasks'],
  FACTURACION_FACTURA: ['facturacion_facturas'],
  DIRECTORIO: ['directorio_profesionales'],
  EMAIL: ['email_accounts'],
};

/** Si quien registra no indica la organización (procesos sin sesión, p.ej.
 *  la edición con Office), se deduce de la entidad afectada -- ningún registro
 *  de actividad sobre datos de un despacho debe quedar fuera de su organización. */
async function inferOrganizacionId(entityType?: string, entityId?: string): Promise<string | null> {
  if (!entityType || !entityId) return null;
  if (entityType === 'ORGANIZACION') return entityId;
  for (const table of ENTITY_ORG_SOURCES[entityType] || []) {
    try {
      const { rows } = await pool.query(`SELECT organizacion_id FROM ${table} WHERE id::text = $1 LIMIT 1`, [entityId]);
      if (rows[0]?.organizacion_id) return rows[0].organizacion_id;
    } catch { /* tabla sin la columna: siguiente */ }
  }
  return null;
}

export async function logActivity(
  userId: string,
  userName: string,
  actionType: string,
  entityType?: string,
  entityId?: string,
  entityName?: string,
  opts?: { eventType?: EventType; ipAddress?: string; sessionId?: string; userAgent?: string; deviceId?: string; organizacionId?: string | null }
): Promise<void> {
  // entity_id es UUID: un identificador de otro tipo (de Quipu, de Gmail...)
  // hacía fallar el registro entero. Se guarda la acción sin él.
  if (entityId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId)) entityId = undefined;
  try {
    await pool.query(
      `INSERT INTO activity_log
         (user_id, user_name, action_type, entity_type, entity_id, entity_name,
          event_type, ip_address, session_id, user_agent, device_id, organizacion_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        userId,
        userName,
        actionType,
        entityType || null,
        entityId || null,
        entityName || null,
        opts?.eventType || 'ACTION',
        opts?.ipAddress || null,
        opts?.sessionId || null,
        opts?.userAgent || null,
        opts?.deviceId || null,
        opts?.organizacionId || (await inferOrganizacionId(entityType, entityId)),
      ]
    );
  } catch (e: any) {
    // Nunca rompe la acción que se registra, pero que un registro de auditoría
    // se pierda no debe pasar en silencio (14/10/2026).
    console.warn('[trazabilidad] no se pudo registrar:', actionType, '-', e?.message || e);
  }
}

export async function logActivityForReq(
  req: Request,
  actionType: string,
  entityType?: string,
  entityId?: string,
  entityName?: string,
  eventType?: EventType
): Promise<void> {
  const userId = (req as any).auth?.userId || 'SYSTEM';
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  return logActivity(userId, userName, actionType, entityType, entityId, entityName, {
    eventType: eventType || 'ACTION',
    ipAddress: getClientIp(req),
    userAgent: getUA(req),
    deviceId: getDeviceId(req),
    organizacionId: (req as any).organizacionId || null,
  });
}

export async function logServerStart(): Promise<void> {
  await logActivity('SYSTEM', 'Sistema', 'Servidor iniciado', undefined, undefined, undefined, {
    eventType: 'SERVER_START',
    ipAddress: 'localhost',
  });
  console.log('[Trazabilidad] SERVER_START registrado');
}

export const registerLogin = async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const userName = await resolveUserName(userId);
    const ip = getClientIp(req);
    const sessionId = (req as any).auth?.sessionId || null;
    const deviceId = getDeviceId(req);

    const { rows } = await pool.query(
      `
      SELECT id FROM activity_log
      WHERE user_id=$1 AND event_type='LOGIN' AND ip_address=$2
        AND COALESCE(device_id, '') = COALESCE($3, '')
        AND created_at > NOW()-INTERVAL '30 minutes'
      ORDER BY created_at DESC LIMIT 1`,
      [userId, ip, deviceId]
    );

    if (rows.length) {
      return res.json({ success: true, data: { already: true } });
    }

    await logActivity(
      userId,
      userName,
      `Inicio de sesión desde ${ip}`,
      undefined,
      undefined,
      undefined,
      { eventType: 'LOGIN', ipAddress: ip, sessionId, userAgent: getUA(req), deviceId, organizacionId: (req as any).organizacionId || null }
    );

    return res.json({ success: true, data: { logged: true, ip } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const registerLogout = async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const userName = await resolveUserName(userId);
    const ip = getClientIp(req);
    const sessionId = (req as any).auth?.sessionId || null;
    const deviceId = getDeviceId(req);

    await logActivity(userId, userName, 'Cierre de sesión', undefined, undefined, undefined, {
      eventType: 'LOGOUT',
      ipAddress: ip,
      sessionId,
      userAgent: getUA(req),
      deviceId,
      organizacionId: (req as any).organizacionId || null,
    });

    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: pgErr(e) });
  }
};

// ── Quién ve qué en Trazabilidad (14/10/2026) ───────────────────────────────
// Antes cualquier miembro veía la actividad de todos (IP, dispositivo, a quién
// se mandó cada correo, qué cliente tocó...). Ahora:
//  · propietario y administradores: la trazabilidad completa;
//  · soporte: la "técnica" -- sesiones, IP, dispositivo y tipo de cada acción
//    de todos, pero sin datos de clientes (ni nombres ni asuntos); el
//    propietario o un administrador puede darle acceso completo unas horas;
//  · el resto: solo su propia actividad.
export type NivelTrazabilidad = 'completa' | 'tecnica' | 'propia';

export async function nivelTrazabilidad(req: Request): Promise<{ nivel: NivelTrazabilidad; hasta: string | null }> {
  const rol = (req as any).organizacionRol;
  if (rol === 'propietario' || rol === 'admin') return { nivel: 'completa', hasta: null };
  if (rol === 'soporte') {
    const { rows } = await pool.query(
      `SELECT MAX(hasta) AS hasta FROM trazabilidad_accesos
        WHERE organizacion_id = $1 AND user_id = $2 AND revocado_at IS NULL AND hasta > NOW()`,
      [(req as any).organizacionId, (req as any).auth?.userId],
    ).catch(() => ({ rows: [] as any[] }));
    if (rows[0]?.hasta) return { nivel: 'completa', hasta: new Date(rows[0].hasta).toISOString() };
    return { nivel: 'tecnica', hasta: null };
  }
  return { nivel: 'propia', hasta: null };
}

const VERBO: Record<string, string> = {
  CREATE: 'Creación', UPDATE: 'Modificación', DELETE: 'Eliminación', VIEW: 'Consulta',
  EXPORT: 'Exportación', UPLOAD: 'Subida de archivo', DOWNLOAD: 'Descarga', ACTION: 'Acción',
};
const MODULO: Record<string, string> = {
  CLIENT: 'cliente', CLIENT_IMPORT: 'importación de clientes', EXPEDIENTE: 'expediente', AGENDA: 'agenda',
  TASK: 'tarea', EMAIL: 'correo', DIRECTORIO: 'directorio', QUIPU: 'Quipu', ORGANIZACION: 'organización',
  FACTURACION_FACTURA: 'factura', FACTURACION_GASTO: 'gasto', FACTURACION_PRESUPUESTO: 'presupuesto',
};
const SIN_CONTENIDO = new Set(['LOGIN', 'LOGOUT', 'SERVER_START', 'AUTH_ERROR']);

/** Vista técnica: el texto de la acción se rehace con su tipo y módulo (el
 *  original puede llevar nombres o asuntos) y se quitan entidad y nombre. */
function sinContenido(row: any) {
  if (SIN_CONTENIDO.has(row.event_type)) return { ...row, entity_id: null, entity_name: null };
  const modulo = row.entity_type ? (MODULO[row.entity_type] || String(row.entity_type).toLowerCase()) : null;
  return {
    ...row,
    action_type: `${VERBO[row.event_type] || 'Acción'}${modulo ? ' · ' + modulo : ''}`,
    entity_id: null,
    entity_name: null,
  };
}

/** GET /api/activity/nivel — qué ve esta persona (para que la pantalla lo diga). */
export const getNivelTrazabilidad = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await nivelTrazabilidad(req) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

const esGestor = (req: Request) => ['propietario', 'admin'].includes((req as any).organizacionRol);

/** GET /api/activity/accesos-temporales — miembros de soporte y si tienen
 *  ahora acceso completo (solo propietario/administradores). */
export const getAccesosTemporales = async (req: Request, res: Response) => {
  if (!esGestor(req)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
  try {
    const { rows } = await pool.query(
      `SELECT m.user_id,
              (SELECT MAX(a.hasta) FROM trazabilidad_accesos a
                WHERE a.organizacion_id = m.organizacion_id AND a.user_id = m.user_id
                  AND a.revocado_at IS NULL AND a.hasta > NOW()) AS hasta
         FROM organizacion_miembros m
        WHERE m.organizacion_id = $1 AND m.rol = 'soporte'`,
      [(req as any).organizacionId],
    );
    const data = await Promise.all(rows.map(async (r: any) => ({
      user_id: r.user_id, nombre: await resolveUserName(r.user_id), hasta: r.hasta ? new Date(r.hasta).toISOString() : null,
    })));
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

/** POST /api/activity/accesos-temporales { user_id, horas } — da acceso
 *  completo a un miembro de soporte durante unas horas (1-72). */
export const concederAccesoTemporal = async (req: Request, res: Response) => {
  if (!esGestor(req)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
  const organizacionId = (req as any).organizacionId;
  const target = String(req.body?.user_id || '');
  const horas = Math.round(Number(req.body?.horas || 24));
  if (!target || !(horas >= 1 && horas <= 72)) return res.status(400).json({ success: false, error: 'Indica la persona y entre 1 y 72 horas.' });
  try {
    const { rows } = await pool.query(`SELECT rol FROM organizacion_miembros WHERE organizacion_id = $1 AND user_id = $2`, [organizacionId, target]);
    if (rows[0]?.rol !== 'soporte') return res.status(400).json({ success: false, error: 'Solo se da a miembros con rol de soporte (el resto ya tiene su nivel).' });
    const { rows: ins } = await pool.query(
      `INSERT INTO trazabilidad_accesos (organizacion_id, user_id, concedido_por, hasta)
       VALUES ($1, $2, $3, NOW() + make_interval(hours => $4)) RETURNING hasta`,
      [organizacionId, target, (req as any).auth?.userId, horas],
    );
    const nombre = await resolveUserName(target);
    await logActivityForReq(req, `Acceso completo a la trazabilidad concedido a ${nombre} durante ${horas} h`, 'ORGANIZACION', organizacionId, undefined, 'UPDATE');
    res.status(201).json({ success: true, data: { user_id: target, hasta: new Date(ins[0].hasta).toISOString() } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

/** DELETE /api/activity/accesos-temporales/:userId — lo retira antes de tiempo. */
export const revocarAccesoTemporal = async (req: Request, res: Response) => {
  if (!esGestor(req)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
  const organizacionId = (req as any).organizacionId;
  const target = String(req.params.userId || '');
  try {
    const { rowCount } = await pool.query(
      `UPDATE trazabilidad_accesos SET revocado_at = NOW()
        WHERE organizacion_id = $1 AND user_id = $2 AND revocado_at IS NULL AND hasta > NOW()`,
      [organizacionId, target],
    );
    if (rowCount) {
      const nombre = await resolveUserName(target);
      await logActivityForReq(req, `Acceso completo a la trazabilidad retirado a ${nombre}`, 'ORGANIZACION', organizacionId, undefined, 'UPDATE');
    }
    res.json({ success: true, data: { revocados: rowCount || 0 } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getActivity = async (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || '100'), 500);
  const eventType = (req.query.event_type as string) || '';

  try {
    // Solo la organización activa (ver migración 'Trazabilidad por organización').
    const { nivel } = await nivelTrazabilidad(req);
    const params: any[] = [limit, (req as any).organizacionId];
    let filter = 'WHERE organizacion_id=$2';
    if (eventType) { params.push(eventType); filter += ` AND event_type=$${params.length}`; }
    if (nivel === 'propia') { params.push((req as any).auth?.userId); filter += ` AND user_id=$${params.length}`; }

    const { rows } = await pool.query(
      `
      SELECT id, user_id, user_name, action_type,
             entity_type, entity_id, entity_name,
             event_type, ip_address, session_id, user_agent, device_id, created_at
      FROM activity_log
      ${filter}
      ORDER BY created_at DESC LIMIT $1
    `,
      params
    );

    res.json({ success: true, data: nivel === 'tecnica' ? rows.map(sinContenido) : rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getClientActivity = async (req: Request, res: Response) => {
  const { clientId } = req.params;

  try {
    // Historial de la ficha del cliente: para quien puede ver Clientes. La IP
    // y el dispositivo, solo con la trazabilidad completa (14/10/2026).
    const organizacionId = (req as any).organizacionId;
    const uid = (req as any).auth?.userId;
    if ((await resolveEffectivePermission(organizacionId, uid, (req as any).organizacionRol, 'clientes')) === 'ninguno') {
      return res.status(403).json({ success: false, error: 'No tienes acceso a Clientes.' });
    }
    const { nivel } = await nivelTrazabilidad(req);
    const { rows } = await pool.query(
      `
      SELECT al.id, al.user_id, al.user_name, al.action_type,
             al.entity_type, al.entity_id, al.entity_name,
             al.event_type, al.ip_address, al.device_id, al.created_at,
             cm.avatar_url
      FROM activity_log al
      LEFT JOIN (
        SELECT DISTINCT ON (user_id) user_id, avatar_url
        FROM chat_miembros
        WHERE avatar_url IS NOT NULL AND avatar_url <> ''
        ORDER BY user_id, joined_at DESC NULLS LAST
      ) cm ON cm.user_id = al.user_id
      WHERE al.organizacion_id = $2
        -- entity_id es UUID: antes se comparaba con texto y la consulta fallaba
        -- (la pestaña de historial de la ficha del cliente daba error).
        AND (al.entity_id = $1::uuid
         OR al.entity_id IN (SELECT id FROM expedientes WHERE cliente_id = $1::uuid AND organizacion_id = $2))
      ORDER BY al.created_at DESC LIMIT 200`,
      [clientId, (req as any).organizacionId]
    );

    res.json({ success: true, data: nivel === 'completa' ? rows : rows.map((r: any) => ({ ...r, ip_address: null, device_id: null })) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const addClientActivity = async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { action_type, description } = req.body;
  const userId = (req as any).auth?.userId || 'SYSTEM';
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  if (!action_type?.trim()) {
    return res.status(400).json({ success: false, error: 'action_type es obligatorio.' });
  }

  try {
    const cr = await pool.query(
      `SELECT COALESCE(commercial_name,CONCAT(first_name,' ',last_name)) AS name FROM entities WHERE id=$1 AND organizacion_id=$2`,
      [clientId, (req as any).organizacionId]
    );
    if (!cr.rows.length) return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
    const entityName = cr.rows[0]?.name || clientId;
    const fullAction = description?.trim()
      ? `${action_type.trim()}: ${description.trim()}`
      : action_type.trim();

    const { rows } = await pool.query(
      `INSERT INTO activity_log
         (user_id,user_name,action_type,entity_type,entity_id,entity_name,event_type,ip_address,user_agent,device_id,organizacion_id)
       VALUES ($1,$2,$3,'CLIENT',$4,$5,'ACTION',$6,$7,$8,$9) RETURNING *`,
      [userId, userName, fullAction, clientId, entityName, getClientIp(req), getUA(req), getDeviceId(req), (req as any).organizacionId]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getActivityByUsers = async (req: Request, res: Response) => {
  try {
    // Sin trazabilidad completa ni técnica, solo aparece uno mismo.
    const { nivel } = await nivelTrazabilidad(req);
    const soloYo = nivel === 'propia';
    const { rows } = await pool.query(`
      SELECT
        user_id,
        (array_agg(user_name ORDER BY created_at DESC))[1]              AS user_name,
        COUNT(*)::int                                                   AS total_actions,
        COUNT(*) FILTER (WHERE event_type='LOGIN')::int                 AS total_logins,
        COUNT(*) FILTER (WHERE event_type='LOGOUT')::int                AS total_logouts,
        MAX(created_at)                                                 AS last_action_at,
        MIN(created_at)                                                 AS first_action_at,
        MAX(CASE WHEN event_type='LOGIN' THEN created_at END)           AS last_login_at,
        (array_agg(ip_address ORDER BY created_at DESC)
          FILTER (WHERE ip_address IS NOT NULL AND ip_address!='localhost'))[1] AS last_ip,
        (array_agg(device_id ORDER BY created_at DESC)
          FILTER (WHERE device_id IS NOT NULL AND device_id!=''))[1] AS last_device_id,
        json_agg(DISTINCT event_type) FILTER (WHERE event_type IS NOT NULL) AS event_types,
        json_agg(DISTINCT entity_type) FILTER (WHERE entity_type IS NOT NULL) AS entity_types
      FROM activity_log
      WHERE user_id != 'SYSTEM' AND organizacion_id = $1 ${soloYo ? 'AND user_id = $2' : ''}
      GROUP BY user_id
      ORDER BY MAX(created_at) DESC
    `, soloYo ? [(req as any).organizacionId, (req as any).auth?.userId] : [(req as any).organizacionId]);

    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getUserActivity = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const limit = Math.min(parseInt((req.query.limit as string) || '500'), 1000);
  const offset = parseInt((req.query.offset as string) || '0');
  const eventType = (req.query.event_type as string) || '';
  const dateFrom = (req.query.date_from as string) || '';
  const dateTo = (req.query.date_to as string) || '';

  try {
    const { nivel } = await nivelTrazabilidad(req);
    if (nivel === 'propia' && userId !== (req as any).auth?.userId) {
      return res.status(403).json({ success: false, error: 'Solo puedes ver tu propia actividad.' });
    }
    // WHERE compartido entre la consulta de filas y la de total, para que
    // "Mostrando X de Y" y el paginado ("hay mas") reflejen los mismos filtros.
    const conditions: string[] = ['user_id=$1', 'organizacion_id=$2'];
    const whereParams: any[] = [userId, (req as any).organizacionId];
    if (eventType) { whereParams.push(eventType); conditions.push(`event_type=$${whereParams.length}`); }
    if (dateFrom)  { whereParams.push(dateFrom);  conditions.push(`created_at >= $${whereParams.length}::date`); }
    if (dateTo)    { whereParams.push(dateTo);    conditions.push(`created_at < ($${whereParams.length}::date + INTERVAL '1 day')`); }
    const where = conditions.join(' AND ');

    const rowsParams = [...whereParams, limit, offset];
    const [rows, total] = await Promise.all([
      pool.query(
        `
        SELECT id, user_id, user_name, action_type,
               entity_type, entity_id, entity_name,
               event_type, ip_address, session_id, user_agent, device_id, created_at
        FROM activity_log
        WHERE ${where}
        ORDER BY created_at DESC LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}
      `,
        rowsParams
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM activity_log WHERE ${where}`, whereParams),
    ]);

    res.json({ success: true, data: nivel === 'tecnica' ? rows.rows.map(sinContenido) : rows.rows, total: total.rows[0]?.total ?? 0 });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getMyActivity = async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  const limit = Math.min(parseInt((req.query.limit as string) || '100'), 500);
  const offset = parseInt((req.query.offset as string) || '0');
  const eventType = (req.query.event_type as string) || '';

  try {
    const params: any[] = [userId, limit, offset, (req as any).organizacionId];
    const filter = eventType ? `AND event_type=$5` : '';
    if (eventType) params.push(eventType);

    const [rows, total] = await Promise.all([
      pool.query(
        
        `
        SELECT id, user_id, user_name, action_type,
               entity_type, entity_id, entity_name,
               event_type, ip_address, session_id, user_agent, device_id, created_at
        FROM activity_log
        WHERE user_id=$1 AND organizacion_id=$4 ${filter}
        ORDER BY created_at DESC LIMIT $2 OFFSET $3
      `,
        params
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM activity_log WHERE user_id=$1 AND organizacion_id=$2`, [userId, (req as any).organizacionId]),
    ]);

    return res.json({ success: true, data: rows.rows, total: total.rows[0]?.total ?? 0 });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: pgErr(e) });
  }
};