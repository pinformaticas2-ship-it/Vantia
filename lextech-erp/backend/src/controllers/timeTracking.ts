import { Response } from 'express';
import pool from '../config/database';

export const registerEntry = async (req: any, res: Response) => {
    const userId = req.auth.userId;
    const ip = req.ip;
    
    try {
        await pool.query(
            `INSERT INTO time_entries (user_id, type, ip_address) VALUES ($1, 'ENTRY', $2)`,
            [userId, ip]
        );
        res.json({ success: true, msg: "Fichaje de entrada registrado correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al fichar" });
    }
};

export const registerExit = async (req: any, res: Response) => {
    const userId = req.auth.userId;
    const ip = req.ip;
    
    try {
        await pool.query(
            `INSERT INTO time_entries (user_id, type, ip_address) VALUES ($1, 'EXIT', $2)`,
            [userId, ip]
        );
        res.json({ success: true, msg: "Fichaje de salida registrado. Buen descanso." });
    } catch (error) {
        res.status(500).json({ error: "Error al fichar salida" });
    }
};