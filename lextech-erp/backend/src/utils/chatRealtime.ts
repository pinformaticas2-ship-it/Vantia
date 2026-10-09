import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { emitEmailEvent } from './emailSSE';

// Avisos en tiempo real del chat interno (09/10/2026). Antes cada pestaña
// preguntaba al servidor por mensajes nuevos cada 0,7 s, por la lista de
// canales cada 1,4 s y por "escribiendo…" cada 1,2 s (~4 peticiones/s por
// usuario). Ahora, cuando algo cambia, el servidor avisa por el canal de
// eventos que ya existe (/api/email/events, uno por usuario) y el navegador
// pide entonces los datos por las rutas normales (con sus permisos); el
// sondeo queda solo como respaldo, mucho más espaciado.
//
// El aviso NO lleva contenido: solo { type: 'chat', kind, canalId }. Así no
// importa a quién de la organización le llegue.

export type ChatEventKind = 'mensajes' | 'typing' | 'fijados' | 'miembros' | 'canales' | 'leido' | 'presencia';

async function miembrosOrganizacion(organizacionId: string): Promise<string[]> {
  const { rows } = await pool.query(`SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1`, [organizacionId]);
  return rows.map((r: any) => r.user_id);
}

export async function emitirChat(destinatarios: string[], kind: ChatEventKind, canalId: string | null): Promise<void> {
  const data = { type: 'chat', kind, canalId };
  for (const uid of new Set(destinatarios)) emitEmailEvent(uid, data);
}

/** Qué tipo de cambio es cada petición del chat (null: no avisa a nadie). */
function clasificar(req: Request): { kind: ChatEventKind; soloYo?: boolean } | null {
  const m = req.method;
  const p = req.path;
  if (m === 'GET') return null;
  if (/^\/canales\/[^/]+\/typing$/.test(p)) return { kind: 'typing' };
  if (/^\/canales\/[^/]+\/mensajes$/.test(p)) return { kind: 'mensajes' };
  if (/^\/mensajes\/[^/]+(\/reacciones)?$/.test(p)) return { kind: 'mensajes' };
  if (/^\/canales\/[^/]+\/fijar\//.test(p)) return { kind: 'fijados' };
  if (/^\/canales\/[^/]+\/(miembros|join|leave)/.test(p)) return { kind: 'miembros' };
  if (/^\/canales\/[^/]+\/leido$/.test(p) || p === '/leido') return { kind: 'leido', soloYo: true };
  if (/^\/mensajes\/[^/]+\/favorito$/.test(p)) return null;
  if (/^\/canales\/[^/]+\/sesion-expediente$/.test(p)) return { kind: 'mensajes' };
  if (/^\/canales(\/[^/]+)?$/.test(p) || p === '/dm') return { kind: 'canales' };
  if (p === '/me/status') return { kind: 'presencia' };
  return null;
}

/** Middleware del router de chat: cuando una petición que cambia algo termina
 *  bien, avisa en tiempo real (sin retrasar la respuesta). */
export function avisosChatEnTiempoReal(req: Request, res: Response, next: NextFunction): void {
  const tipo = clasificar(req);
  if (!tipo) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const userId = (req as any).auth?.userId as string | undefined;
    const organizacionId = (req as any).organizacionId as string | undefined;
    void (async () => {
      try {
        let canalId: string | null = (req.params as any)?.id && /^\/canales\//.test(req.path) ? (req.params as any).id : null;
        if (!canalId) {
          const mc = /^\/canales\/([^/]+)/.exec(req.path);
          if (mc) canalId = mc[1];
        }
        if (!canalId) {
          const mm = /^\/mensajes\/([^/]+)/.exec(req.path);
          if (mm) {
            const { rows } = await pool.query(`SELECT canal_id FROM chat_mensajes WHERE id = $1`, [mm[1]]);
            canalId = rows[0]?.canal_id || null;
          }
        }
        if (tipo.soloYo) { if (userId) await emitirChat([userId], tipo.kind, canalId); return; }
        if (!organizacionId) return;
        await emitirChat(await miembrosOrganizacion(organizacionId), tipo.kind, canalId);
      } catch (e: any) {
        console.warn('[chat] aviso en tiempo real:', e?.message || e);
      }
    })();
  });
  next();
}
