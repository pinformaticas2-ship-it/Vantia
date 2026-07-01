import pool from '../config/database';
import {
  resolveUserEmailAndName,
  sendTaskDigest,
  DigestTask,
  TaskDigest,
} from '../services/taskNotificationsService';

// ── Consulta de tareas pendientes del día ───────────────────────────────────────
async function fetchDigestTasks(): Promise<Map<string, { tasks: DigestTask[]; userId: string }>> {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr    = today.toISOString().slice(0, 10);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { rows } = await pool.query<DigestTask & { user_id: string }>(
    `SELECT
       ct.id, ct.titulo, ct.estado, ct.prioridad, ct.tipo,
       ct.plazo::text                         AS plazo,
       ct.fecha_aviso::text                   AS fecha_aviso,
       ct.expediente, ct.juzgado,
       ct.user_id,
       COALESCE(e.commercial_name,
                TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')),
                ct.client_name)               AS client_name_resolved,
       ct.client_name
     FROM client_tasks ct
     LEFT JOIN entities e ON e.id = ct.client_id
     WHERE ct.estado != 'completada'
       AND ct.user_id IS NOT NULL
       AND (
         ct.plazo::date     <= $2              -- vencida o mañana
         OR ct.fecha_aviso::date = $1          -- aviso programado hoy
       )
     ORDER BY ct.user_id, ct.plazo ASC NULLS LAST`,
    [todayStr, tomorrowStr],
  );

  const byUser = new Map<string, { tasks: DigestTask[]; userId: string }>();

  for (const row of rows) {
    const { user_id, ...task } = row;
    if (!byUser.has(user_id)) byUser.set(user_id, { tasks: [], userId: user_id });
    byUser.get(user_id)!.tasks.push(task);
  }

  return byUser;
}

// ── Clasificar tareas por categoría ────────────────────────────────────────────
function buildDigest(tasks: DigestTask[]): TaskDigest {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr    = today.toISOString().slice(0, 10);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const overdue:  DigestTask[] = [];
  const todayArr: DigestTask[] = [];
  const aviso:    DigestTask[] = [];
  const tomArr:   DigestTask[] = [];

  for (const t of tasks) {
    const plazoStr  = t.plazo?.slice(0, 10) ?? null;
    const avisoStr  = t.fecha_aviso?.slice(0, 10) ?? null;

    if (plazoStr && plazoStr < todayStr) {
      overdue.push(t);
    } else if (plazoStr === todayStr) {
      todayArr.push(t);
    } else if (avisoStr === todayStr) {
      aviso.push(t);
    } else if (plazoStr === tomorrowStr) {
      tomArr.push(t);
    }
  }

  return { overdue, today: todayArr, aviso, tomorrow: tomArr };
}

// ── Ejecutar el job ─────────────────────────────────────────────────────────────
export async function runTaskReminderJob(): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log('⏭  TaskReminderJob: RESEND_API_KEY no configurada, saltando.');
    return;
  }

  console.log('📧 TaskReminderJob: iniciando envío de recordatorios...');

  try {
    const byUser = await fetchDigestTasks();

    if (byUser.size === 0) {
      console.log('📧 TaskReminderJob: no hay tareas pendientes hoy.');
      return;
    }

    let sent = 0;
    let skipped = 0;

    for (const [userId, { tasks }] of byUser) {
      const digest = buildDigest(tasks);
      const total  = digest.overdue.length + digest.today.length + digest.aviso.length + digest.tomorrow.length;
      if (total === 0) { skipped++; continue; }

      const { email, name } = await resolveUserEmailAndName(userId);
      if (!email) {
        console.warn(`📧 TaskReminderJob: usuario ${userId} sin email en Clerk, omitido.`);
        skipped++;
        continue;
      }

      try {
        await sendTaskDigest(email, name, digest);
        console.log(`📧 TaskReminderJob: digest enviado a ${email} (${total} tareas).`);
        sent++;
      } catch (err: any) {
        console.error(`📧 TaskReminderJob: error enviando a ${email}:`, err?.message || err);
        skipped++;
      }
    }

    console.log(`📧 TaskReminderJob: ${sent} emails enviados, ${skipped} omitidos.`);
  } catch (err: any) {
    console.error('📧 TaskReminderJob: error general:', err?.message || err);
  }
}

// ── Programar ejecución diaria a las 08:00 ─────────────────────────────────────
export function scheduleTaskReminderJob(): void {
  const msUntilNextRun = (): number => {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(8, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1); // ya pasaron las 8 → mañana
    return next.getTime() - now.getTime();
  };

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const scheduleNext = () => {
    const delay = msUntilNextRun();
    const nextAt = new Date(Date.now() + delay).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    console.log(`📧 TaskReminderJob: próxima ejecución en ${Math.round(delay / 60000)} min (${nextAt}).`);

    setTimeout(() => {
      runTaskReminderJob().catch(() => {});
      // Repetir cada 24h desde la primera ejecución
      setInterval(() => runTaskReminderJob().catch(() => {}), ONE_DAY_MS);
    }, delay);
  };

  scheduleNext();
}
