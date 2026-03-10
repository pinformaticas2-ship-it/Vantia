import { Request, Response } from 'express';
import pool from '../config/database';

// ─────────────────────────────────────────────────────────────
// GET /api/entities
// ─────────────────────────────────────────────────────────────
export const getEntities = async (req: any, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT id, internal_number, type, client_status,
                   first_name, last_name, commercial_name,
                   nif_cif, email, phone_1, phone_mobile,
                   address_town, address_province, created_at
            FROM entities
            ORDER BY created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('❌ getEntities:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/entities/:id
// ─────────────────────────────────────────────────────────────
export const getEntityById = async (req: any, res: Response) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM entities WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('❌ getEntityById:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/entities
// ─────────────────────────────────────────────────────────────
export const createEntity = async (req: any, res: Response) => {
    const {
        type, client_status, document_type,
        first_name, last_name, commercial_name,
        nif_cif, gender, birth_date,
        nationality, expedition_country, legal_nature,
        address_street, address_town, address_cp,
        address_province, address_country,
        email, phone_1, phone_2, phone_3,
        phone_mobile, phone_fax, website,
        date_alta, date_baja,
        lopd, commercial_communications, center,
    } = req.body;

    const userId = req.auth?.userId || 'SYSTEM';

    if (!first_name || !nif_cif) {
        return res.status(400).json({
            success: false,
            error: 'Nombre y NIF/CIF son obligatorios.'
        });
    }

    try {
        const result = await pool.query(`
            INSERT INTO entities (
                type, client_status, document_type,
                first_name, last_name, commercial_name,
                nif_cif, gender, birth_date,
                nationality, expedition_country, legal_nature,
                address_street, address_town, address_cp,
                address_province, address_country,
                email, phone_1, phone_2, phone_3,
                phone_mobile, phone_fax, website,
                date_alta, date_baja,
                lopd, commercial_communications, center,
                created_by
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,
                $9::date,$10,$11,$12,$13,$14,$15,
                $16,$17,$18,$19,$20,$21,$22,$23,
                $24,$25::date,$26::date,$27,$28,$29,$30
            ) RETURNING *`,
            [
                type                    || 'CLIENTE',
                client_status           || 'Alta',
                document_type           || 'DNI',
                first_name,
                last_name               || null,
                commercial_name         || null,
                nif_cif,
                gender                  || null,
                birth_date              || null,
                nationality             || 'Española',
                expedition_country      || 'España',
                legal_nature            || null,
                address_street          || null,
                address_town            || null,
                address_cp              || null,
                address_province        || null,
                address_country         || 'España',
                email                   || null,
                phone_1                 || null,
                phone_2                 || null,
                phone_3                 || null,
                phone_mobile            || null,
                phone_fax               || null,
                website                 || null,
                date_alta               || new Date().toISOString().split('T')[0],
                date_baja               || null,
                lopd                    || 'Pendiente',
                commercial_communications || 'No',
                center                  || null,
                userId,
            ]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('❌ createEntity:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};
