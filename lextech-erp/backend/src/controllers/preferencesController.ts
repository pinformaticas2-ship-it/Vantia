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
