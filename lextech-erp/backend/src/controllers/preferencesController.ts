import { Response } from 'express';
import pool from '../config/database';

const pgErr = (e: any) => `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;

const VALID_THEMES = new Set(['rojo', 'azul', 'verde', 'violeta', 'grafito', 'indigo', 'custom']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const getMyPreferences = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const { rows } = await pool.query(
      `SELECT theme, theme_custom_color, theme_custom_secondary, theme_custom_sidebar
       FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
    const prefs = rows[0] || { theme: 'rojo', theme_custom_color: null, theme_custom_secondary: null, theme_custom_sidebar: null };
    res.json({
      success: true,
      data: {
        theme: prefs.theme,
        themeCustomColor: prefs.theme_custom_color,
        themeCustomSecondary: prefs.theme_custom_secondary,
        themeCustomSidebar: prefs.theme_custom_sidebar,
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const updateMyPreferences = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  const theme = String(req.body?.theme || '').trim();
  if (!VALID_THEMES.has(theme)) {
    return res.status(400).json({ success: false, error: 'Tema no válido' });
  }

  const fields = [
    ['themeCustomColor', req.body?.themeCustomColor] as const,
    ['themeCustomSecondary', req.body?.themeCustomSecondary] as const,
    ['themeCustomSidebar', req.body?.themeCustomSidebar] as const,
  ];
  const parsed: Record<string, string | null> = {};
  for (const [key, raw] of fields) {
    if (!raw) { parsed[key] = null; continue; }
    const hex = String(raw).trim();
    if (!HEX_RE.test(hex)) {
      return res.status(400).json({ success: false, error: `${key} no válido (formato #RRGGBB)` });
    }
    parsed[key] = hex;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_preferences (user_id, theme, theme_custom_color, theme_custom_secondary, theme_custom_sidebar, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET theme = EXCLUDED.theme,
             theme_custom_color = EXCLUDED.theme_custom_color,
             theme_custom_secondary = EXCLUDED.theme_custom_secondary,
             theme_custom_sidebar = EXCLUDED.theme_custom_sidebar,
             updated_at = NOW()
       RETURNING theme, theme_custom_color, theme_custom_secondary, theme_custom_sidebar`,
      [userId, theme, parsed.themeCustomColor, parsed.themeCustomSecondary, parsed.themeCustomSidebar]
    );
    res.json({
      success: true,
      data: {
        theme: rows[0].theme,
        themeCustomColor: rows[0].theme_custom_color,
        themeCustomSecondary: rows[0].theme_custom_secondary,
        themeCustomSidebar: rows[0].theme_custom_sidebar,
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

// ── Preferencias personales nuevas (14/10/2026) ─────────────────────────────
// Modo claro/oscuro, página de inicio, primer día de la semana en la agenda,
// atajos de teclado y "Mi perfil" (cargo, teléfono). Van en user_preferences.extras.

export const PAGINAS_INICIO = [
  '/dashboard', '/dashboard/agenda', '/dashboard/expedientes', '/dashboard/tareas',
  '/dashboard/vistas', '/dashboard/chat', '/dashboard/correo', '/dashboard/clientes',
];

export interface PrefsExtras {
  modo: 'claro' | 'oscuro' | 'sistema';
  inicio: string;
  primerDia: 'lunes' | 'domingo';
  atajos: boolean;
  cargo: string;
  telefono: string;
}

export const EXTRAS_POR_DEFECTO: PrefsExtras = {
  modo: 'claro', inicio: '/dashboard', primerDia: 'lunes', atajos: true, cargo: '', telefono: '',
};

export function normalizarExtras(raw: any, base: PrefsExtras = EXTRAS_POR_DEFECTO): PrefsExtras {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    modo: ['claro', 'oscuro', 'sistema'].includes(r.modo) ? r.modo : base.modo,
    inicio: PAGINAS_INICIO.includes(r.inicio) ? r.inicio : base.inicio,
    primerDia: r.primerDia === 'domingo' || r.primerDia === 'lunes' ? r.primerDia : base.primerDia,
    atajos: typeof r.atajos === 'boolean' ? r.atajos : base.atajos,
    cargo: typeof r.cargo === 'string' ? r.cargo.trim().slice(0, 100) : base.cargo,
    telefono: typeof r.telefono === 'string' ? r.telefono.replace(/[^\d+()\s-]/g, '').trim().slice(0, 30) : base.telefono,
  };
}

export const getMyExtras = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  try {
    const { rows } = await pool.query(`SELECT extras FROM user_preferences WHERE user_id = $1`, [userId]);
    res.json({ success: true, data: normalizarExtras(rows[0]?.extras) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

/** PUT /api/preferences/extras — solo cambia lo que llega; lo demás se queda. */
export const updateMyExtras = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  try {
    const { rows } = await pool.query(`SELECT extras FROM user_preferences WHERE user_id = $1`, [userId]);
    const actual = normalizarExtras(rows[0]?.extras);
    const nuevo = normalizarExtras(req.body, actual);
    await pool.query(
      `INSERT INTO user_preferences (user_id, theme, extras, updated_at) VALUES ($1, 'rojo', $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET extras = EXCLUDED.extras, updated_at = NOW()`,
      [userId, JSON.stringify(nuevo)],
    );
    // El cargo es el que se ve junto al nombre en el chat (en esta organización).
    if (nuevo.cargo !== actual.cargo && req.organizacionId) {
      await pool.query(
        `UPDATE chat_miembros SET role_label = $2
          WHERE user_id = $1 AND canal_id IN (SELECT id FROM chat_canales WHERE organizacion_id = $3)`,
        [userId, nuevo.cargo || 'Miembro', req.organizacionId],
      ).catch(() => undefined);
    }
    res.json({ success: true, data: nuevo });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};
