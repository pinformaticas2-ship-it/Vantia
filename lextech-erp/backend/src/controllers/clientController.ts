import { Request, Response } from 'express';
import pool from '../config/database';

/**
 * INTERFAZ EXTENDIDA
 * Soluciona la falta de tipos para Middleware de Auth (Clerk/JWT) y Multer.
 */
interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
  };
  file?: Express.Multer.File;
}

export const createClient = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      first_name, 
      last_name, 
      nif_cif, 
      email, 
      phone_1, 
      type, 
      commercial_name, 
      address_town 
    } = req.body;

    // Extraemos userId con fallback para evitar nulos en auditoría
    const userId = req.auth?.userId || 'SYSTEM';
    
    // Gestión de Multer: Ruta de la imagen del DNI
    const dni_image_url = req.file ? `/uploads/dnis/${req.file.filename}` : null;

    // Validación de campos obligatorios
    if (!first_name || !nif_cif) {
      return res.status(400).json({ 
        success: false, 
        error: "Nombre y NIF son obligatorios." 
      });
    }

    const query = `
      INSERT INTO entities (
        type, 
        first_name, 
        last_name, 
        commercial_name, 
        nif_cif, 
        email, 
        phone_1, 
        address_town, 
        created_by, 
        dni_image_url
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    const values = [
      type || 'CLIENTE', 
      first_name, 
      last_name, 
      commercial_name, 
      nif_cif, 
      email, 
      phone_1, 
      address_town, 
      userId, 
      dni_image_url
    ];

    const result = await pool.query(query, values);

    // Retorno exitoso explícito
    return res.status(201).json({ 
      success: true, 
      data: result.rows[0] 
    });

  } catch (error: any) {
    console.error("❌ Error al crear cliente:", error);

    // Error de clave duplicada en PostgreSQL (NIF/CIF repetido)
    if (error.code === '23505') {
      return res.status(409).json({ 
        success: false, 
        error: "Este NIF/CIF ya está registrado en el sistema." 
      });
    }

    return res.status(500).json({ 
      success: false, 
      error: "Error interno del servidor al procesar el alta." 
    });
  }
};

export const getClients = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM entities ORDER BY created_at DESC');
    
    return res.json({ 
      success: true, 
      data: result.rows 
    });
  } catch (error) {
    console.error("❌ Error obteniendo clientes:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Error obteniendo la lista de clientes." 
    });
  }
};