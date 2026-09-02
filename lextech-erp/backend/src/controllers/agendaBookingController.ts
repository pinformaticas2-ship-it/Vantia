import { Response } from 'express';
import { randomBytes } from 'crypto';
import pool from '../config/database';
import { resolveUserOrgMemberships } from './organizacionesController';

const pgErr = (e: any) => `${e?.message || String(e)}${e?.code ? ` | code: ${e.code}` : ''}`;

const sanitizeText = (value: any) => {
  const str = String(value || '').trim();
  return str || null;
};

const clampInt = (value: any, min: number, max: number, fallback: number) => {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const sanitizeWeekdays = (value: any): number[] => {
  const list = Array.isArray(value) ? value : [];
  const cleaned = Array.from(new Set(
    list.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  ));
  return cleaned.length ? cleaned.sort() : [1, 2, 3, 4, 5];
};

const sanitizeTime = (value: any, fallback: string) => {
  const str = String(value || '').trim();
  return /^\d{2}:\d{2}(:\d{2})?$/.test(str) ? str.slice(0, 5) : fallback;
};

// ── Mi página de reservas (autenticado) ─────────────────────────────────────
export const getMyBookingPage = async (req: any, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

    const result = await pool.query(`SELECT * FROM agenda_booking_pages WHERE user_id = $1`, [userId]);
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error: any) {
    console.error('getMyBookingPage:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const upsertMyBookingPage = async (req: any, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

    const {
      title, description, duration_minutes, buffer_minutes,
      weekdays, start_time, end_time, advance_days, min_notice_hours, active,
    } = req.body;

    const { resolveUserName } = await import('./activityController');
    const userName = await resolveUserName(userId);

    const existing = await pool.query(`SELECT id, token FROM agenda_booking_pages WHERE user_id = $1`, [userId]);

    const values = {
      title: sanitizeText(title) || 'Reserva una cita',
      description: sanitizeText(description),
      duration_minutes: clampInt(duration_minutes, 5, 480, 30),
      buffer_minutes: clampInt(buffer_minutes, 0, 240, 0),
      weekdays: sanitizeWeekdays(weekdays),
      start_time: sanitizeTime(start_time, '09:00'),
      end_time: sanitizeTime(end_time, '18:00'),
      advance_days: clampInt(advance_days, 1, 180, 30),
      min_notice_hours: clampInt(min_notice_hours, 0, 240, 12),
      active: active !== false,
    };

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE agenda_booking_pages SET
           title = $1, description = $2, duration_minutes = $3, buffer_minutes = $4,
           weekdays = $5, start_time = $6, end_time = $7, advance_days = $8,
           min_notice_hours = $9, active = $10, user_name = $11, updated_at = NOW()
         WHERE user_id = $12
         RETURNING *`,
        [
          values.title, values.description, values.duration_minutes, values.buffer_minutes,
          values.weekdays, values.start_time, values.end_time, values.advance_days,
          values.min_notice_hours, values.active, userName, userId,
        ]
      );
    } else {
      const token = randomBytes(18).toString('base64url');
      result = await pool.query(
        `INSERT INTO agenda_booking_pages
           (user_id, user_name, token, title, description, duration_minutes, buffer_minutes,
            weekdays, start_time, end_time, advance_days, min_notice_hours, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          userId, userName, token,
          values.title, values.description, values.duration_minutes, values.buffer_minutes,
          values.weekdays, values.start_time, values.end_time, values.advance_days,
          values.min_notice_hours, values.active,
        ]
      );
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('upsertMyBookingPage:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ── Helpers de disponibilidad (compartidos entre slots y creación de reserva) ──
const loadActivePageByToken = async (token: string) => {
  const result = await pool.query(`SELECT * FROM agenda_booking_pages WHERE token = $1`, [token]);
  const page = result.rows[0];
  if (!page) return { page: null, error: { status: 404, message: 'Enlace de reservas no válido.' } };
  if (!page.active) return { page: null, error: { status: 410, message: 'Esta página de reservas no está activa.' } };
  return { page, error: null };
};

const computeSlotsForDate = async (page: any, dateStr: string): Promise<string[]> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];

  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + page.advance_days);
  if (date < today || date > maxDate) return [];

  const weekday = date.getDay();
  if (!(page.weekdays || []).includes(weekday)) return [];

  const [startH, startM] = String(page.start_time).slice(0, 5).split(':').map(Number);
  const [endH, endM] = String(page.end_time).slice(0, 5).split(':').map(Number);
  const stepMin = page.duration_minutes + page.buffer_minutes;

  const dayStart = new Date(date); dayStart.setHours(startH, startM, 0, 0);
  const dayEnd = new Date(date); dayEnd.setHours(endH, endM, 0, 0);
  const now = new Date();
  const minNoticeMs = page.min_notice_hours * 3600 * 1000;

  const candidates: { start: Date; end: Date; label: string }[] = [];
  for (let t = new Date(dayStart); t.getTime() + page.duration_minutes * 60000 <= dayEnd.getTime(); t = new Date(t.getTime() + stepMin * 60000)) {
    const slotEnd = new Date(t.getTime() + page.duration_minutes * 60000);
    if (t.getTime() - now.getTime() < minNoticeMs) continue;
    candidates.push({
      start: t,
      end: slotEnd,
      label: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
    });
  }
  if (candidates.length === 0) return [];

  const existingRes = await pool.query(
    `SELECT start_at, end_at FROM agenda_events
     WHERE user_id = $1 AND start_at < $2 AND (end_at IS NULL OR end_at > $3)`,
    [page.user_id, dayEnd.toISOString(), dayStart.toISOString()]
  );
  const busy = existingRes.rows.map((r: any) => ({
    start: new Date(r.start_at).getTime(),
    end: r.end_at ? new Date(r.end_at).getTime() : new Date(r.start_at).getTime(),
  }));

  return candidates
    .filter((c) => !busy.some((b) => c.start.getTime() < b.end && c.end.getTime() > b.start))
    .map((c) => c.label);
};

// ── Rutas públicas (sin auth) ────────────────────────────────────────────────
export const getPublicBookingPage = async (req: any, res: Response) => {
  try {
    const { token } = req.params;
    const { page, error } = await loadActivePageByToken(token);
    if (error) return res.status(error.status).json({ success: false, error: error.message });

    res.json({
      success: true,
      data: {
        title: page.title,
        description: page.description,
        duration_minutes: page.duration_minutes,
        owner_name: page.user_name,
        advance_days: page.advance_days,
      },
    });
  } catch (error: any) {
    console.error('getPublicBookingPage:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const getPublicBookingSlots = async (req: any, res: Response) => {
  try {
    const { token } = req.params;
    const date = String(req.query.date || '');
    const { page, error } = await loadActivePageByToken(token);
    if (error) return res.status(error.status).json({ success: false, error: error.message });

    const slots = await computeSlotsForDate(page, date);
    res.json({ success: true, data: slots });
  } catch (error: any) {
    console.error('getPublicBookingSlots:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const createPublicBooking = async (req: any, res: Response) => {
  try {
    const { token } = req.params;
    const { date, time, name, email, notes } = req.body;
    const { page, error } = await loadActivePageByToken(token);
    if (error) return res.status(error.status).json({ success: false, error: error.message });

    if (!sanitizeText(name)) return res.status(400).json({ success: false, error: 'El nombre es obligatorio.' });
    if (!sanitizeText(email)) return res.status(400).json({ success: false, error: 'El email es obligatorio.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ success: false, error: 'Fecha no válida.' });
    if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return res.status(400).json({ success: false, error: 'Hora no válida.' });

    const availableSlots = await computeSlotsForDate(page, date);
    if (!availableSlots.includes(time)) {
      return res.status(409).json({ success: false, error: 'Ese hueco ya no está disponible. Elige otro horario.' });
    }

    const [h, m] = time.split(':').map(Number);
    const startAt = new Date(`${date}T00:00:00`);
    startAt.setHours(h, m, 0, 0);
    const endAt = new Date(startAt.getTime() + page.duration_minutes * 60000);

    // La reserva es pública (sin sesión, no hay req.organizacionId) -- se
    // resuelve la organización del dueño de la página de reservas, igual
    // que hace resolveOrg con una sesión normal (primera organización de la
    // que sea miembro).
    const ownerMemberships = await resolveUserOrgMemberships(page.user_id);
    const organizacionId = ownerMemberships[0]?.organizacionId || null;

    const result = await pool.query(
      `INSERT INTO agenda_events
         (user_id, user_name, title, description, start_at, end_at, all_day, type, status,
          source, guests, booking_page_id, organizacion_id)
       VALUES ($1,$2,$3,$4,$5,$6,false,'cita','pendiente','public_booking',$7,$8,$9)
       RETURNING id, start_at, end_at`,
      [
        page.user_id,
        page.user_name,
        `Cita: ${sanitizeText(name)}`,
        sanitizeText(notes),
        startAt.toISOString(),
        endAt.toISOString(),
        [String(email).trim().toLowerCase()],
        page.id,
        organizacionId,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('createPublicBooking:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};
