// Este archivo define la forma exacta de un Cliente en nuestro código.
// Es nuestro "Contrato de Datos".

export interface Client {
    id?: string; // Opcional porque al crear no lo tenemos, lo genera la DB
    type: 'CLIENTE' | 'CONTRARIO' | 'JUZGADO'; 
    first_name: string;
    last_name?: string;
    commercial_name?: string;
    doc_type: string;
    nif_cif?: string; // opcional: hay clientes reales sin NIF/CIF (asociaciones, importaciones CSV)
    email?: string;
    phone_1?: string;
    phone_2?: string;
    address_town?: string;
    client_status: 'ACTIVO' | 'BAJA' | 'POTENCIAL';
    created_by: string; // El ID del abogado que lo creó
}