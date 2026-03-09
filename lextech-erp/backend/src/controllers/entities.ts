import { Request, Response } from 'express';
import pool from '../config/database';

// GET: Obtener todos los clientes (Resumen para tablas)
export const getEntities = async (req: any, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT id, first_name, last_name, commercial_name, nif_cif, email, phone, client_status 
            FROM entities 
            ORDER BY created_at DESC 
            LIMIT 100
        `);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET: Obtener Ficha Completa de un Cliente (Por ID)
export const getEntityById = async (req: any, res: Response) => {
    const { id } = req.params;
    
    try {
        // Esta consulta es "inteligente": calcula la edad y cuenta expedientes al vuelo
        const query = `
            SELECT 
                e.*,
                -- Cálculo de Edad si hay fecha de nacimiento
                CASE WHEN e.birth_date IS NOT NULL 
                     THEN DATE_PART('year', AGE(CURRENT_DATE, e.birth_date)) 
                     ELSE NULL 
                END AS age,
                -- Contadores rápidos para las pestañas
                (SELECT COUNT(*) FROM cases c WHERE c.client_id = e.id) as active_cases_count,
                (SELECT COUNT(*) FROM entity_notes n WHERE n.entity_id = e.id) as notes_count
            FROM entities e
            WHERE e.id = $1
        `;
        
        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Cliente no encontrado" });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST: Crear nuevo Cliente (Básico)
export const createEntity = async (req: any, res: Response) => {
    const { type, first_name, last_name, nif_cif, email, phone } = req.body;
    const userId = req.auth.userId;

    try {
        const result = await pool.query(
            `INSERT INTO entities (type, first_name, last_name, nif_cif, email, phone, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [type || 'CLIENTE', first_name, last_name, nif_cif, email, phone, userId]
        );

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};