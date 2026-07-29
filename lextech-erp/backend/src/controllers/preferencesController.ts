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
      `SELECT theme, theme_custom_color FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
    const prefs = rows[0] || { theme: 'rojo', theme_custom_color: null };
    res.json({
      success: true,
      data: { theme: prefs.theme, themeCustomColor: prefs.theme_custom_color },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const updateMyPreferences = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  const theme = String(req.body?.theme || '').trim();
  const themeCustomColor = req.body?.themeCustomColor ? String(req.body.themeCustomColor).trim() : null;

  if (!VALID_THEMES.has(theme)) {
    return res.status(400).json({ success: false, error: 'Tema no válido' });
  }
  if (themeCustomColor && !HEX_RE.test(themeCustomColor)) {
    return res.status(400).json({ success: false, error: 'Color personalizado no válido (formato #RRGGBB)' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_preferences (user_id, theme, theme_custom_color, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET theme = EXCLUDED.theme, theme_custom_color = EXCLUDED.theme_custom_color, updated_at = NOW()
       RETURNING theme, theme_custom_color`,
      [userId, theme, themeCustomColor]
    );
    res.json({
      success: true,
      data: { theme: rows[0].theme, themeCustomColor: rows[0].theme_custom_color },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};
