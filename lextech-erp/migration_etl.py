"""
╔══════════════════════════════════════════════════════════════════════╗
║         VANTIA Legis ERP — Script ETL de Migración                  ║
║         Sistema origen : MNProgram / SQL Server (o cualquier ODBC)  ║
║         Sistema destino: Supabase (PostgreSQL)                       ║
╚══════════════════════════════════════════════════════════════════════╝

Requisitos:
    pip install psycopg2-binary pyodbc python-dotenv

Uso:
    python migration_etl.py

Variables de entorno (.env):
    SOURCE_CONN   = "DRIVER={SQL Server};SERVER=localhost;DATABASE=mnprogram;UID=sa;PWD=xxx"
    SUPABASE_CONN = "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
"""

import os
import uuid
import logging
import csv
from datetime import datetime, date
from typing import Optional
import re

import psycopg2
import psycopg2.extras
try:
    import pyodbc
    HAS_PYODBC = True
except ImportError:
    HAS_PYODBC = False

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN — ajusta aquí o usa .env
# ─────────────────────────────────────────────────────────────────────

SOURCE_CONN   = os.getenv("SOURCE_CONN",   "DRIVER={SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=mnprogram;Trusted_Connection=yes")
SUPABASE_CONN = os.getenv("SUPABASE_CONN", "postgresql://postgres:TU_PASSWORD@db.TUPROYECTO.supabase.co:5432/postgres")

BATCH_SIZE = 200   # registros por commit
LOG_FILE   = f"migration_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
ERROR_CSV  = f"errores_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

# ─────────────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

# CSV de errores (para revisar manualmente los registros que fallaron)
error_rows = []

def log_error(entity_type: str, legacy_id, reason: str, raw_data=None):
    error_rows.append({
        "entity_type": entity_type,
        "legacy_id":   str(legacy_id),
        "reason":      reason,
        "raw_data":    str(raw_data)[:300] if raw_data else "",
        "ts":          datetime.now().isoformat(),
    })

# ─────────────────────────────────────────────────────────────────────
# UTILIDADES DE LIMPIEZA DE DATOS
# ─────────────────────────────────────────────────────────────────────

def clean_nif(raw: Optional[str]) -> str:
    """Normaliza NIF/CIF: elimina espacios, guiones, pone en mayúsculas."""
    if not raw:
        return "DESCONOCIDO"
    return re.sub(r"[\s\-\.]", "", str(raw)).upper().strip()

def clean_phone(raw: Optional[str]) -> Optional[str]:
    """Elimina espacios, paréntesis y guiones de un teléfono."""
    if not raw:
        return None
    cleaned = re.sub(r"[\s\-\.\(\)]", "", str(raw)).strip()
    return cleaned if cleaned else None

def clean_str(raw, max_len: int = None) -> Optional[str]:
    """Limpia un string: strip, None si vacío."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    return s[:max_len] if max_len else s

def clean_date(raw) -> Optional[date]:
    """Convierte varios formatos de fecha a date de Python."""
    if raw is None:
        return None
    if isinstance(raw, (datetime, date)):
        return raw.date() if isinstance(raw, datetime) else raw
    s = str(raw).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None  # no reconocido — se insertará NULL

def clean_email(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    e = str(raw).strip().lower()
    return e if "@" in e else None

def normalize_name(raw: Optional[str]) -> str:
    """Capitaliza nombres correctamente (JUAN GARCÍA → Juan García)."""
    if not raw:
        return ""
    return " ".join(w.capitalize() for w in str(raw).strip().split())

# ─────────────────────────────────────────────────────────────────────
# CONEXIONES
# ─────────────────────────────────────────────────────────────────────

def connect_source():
    """Conecta al sistema origen (SQL Server vía pyodbc)."""
    if not HAS_PYODBC:
        raise RuntimeError("pyodbc no instalado. Ejecuta: pip install pyodbc")
    log.info("🔌 Conectando a base de datos origen (SQL Server)...")
    conn = pyodbc.connect(SOURCE_CONN)
    log.info("✅ Conexión origen OK")
    return conn

def connect_supabase():
    """Conecta a Supabase (PostgreSQL)."""
    log.info("🔌 Conectando a Supabase...")
    conn = psycopg2.connect(SUPABASE_CONN)
    conn.autocommit = False
    log.info("✅ Conexión Supabase OK")
    return conn

# ─────────────────────────────────────────────────────────────────────
# TABLA DE MAPEO
# ─────────────────────────────────────────────────────────────────────

def ensure_migration_map(cur_sb):
    """Crea la tabla de mapeo si no existe."""
    cur_sb.execute("""
        CREATE TABLE IF NOT EXISTS public.migration_map (
            entity_type TEXT,
            legacy_id   TEXT,
            new_uuid    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            migrated_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_migration_map_legacy
            ON public.migration_map (entity_type, legacy_id);
    """)

def get_or_create_uuid(cur_sb, entity_type: str, legacy_id: str) -> str:
    """Devuelve el UUID nuevo para un ID legado, creándolo si no existe."""
    cur_sb.execute(
        "SELECT new_uuid FROM migration_map WHERE entity_type = %s AND legacy_id = %s",
        (entity_type, str(legacy_id))
    )
    row = cur_sb.fetchone()
    if row:
        return str(row[0])
    new_id = str(uuid.uuid4())
    cur_sb.execute(
        "INSERT INTO migration_map (entity_type, legacy_id, new_uuid) VALUES (%s, %s, %s)",
        (entity_type, str(legacy_id), new_id)
    )
    return new_id

# ─────────────────────────────────────────────────────────────────────
# MIGRACIÓN: CLIENTES → entities
# ─────────────────────────────────────────────────────────────────────
#
# ⚠️  AJUSTA los nombres de columnas del SELECT según tu base origen.
#     Las columnas de la derecha son de MNProgram (ejemplo típico).
#     Si usas otro sistema, cámbia solo el SELECT y el mapeo de `row`.

CLIENTS_QUERY = """
    SELECT
        cli_id,
        cli_nombre,
        cli_apellido1,
        cli_apellido2,
        cli_nif,
        cli_email,
        cli_telefono1,
        cli_telefono2,
        cli_movil,
        cli_domicilio,
        cli_cp,
        cli_poblacion,
        cli_provincia,
        cli_fecha_alta,
        cli_fecha_baja,
        cli_tipo,
        cli_estado,
        cli_lopd
    FROM dbo.clientes
    ORDER BY cli_id
"""
# Si tu tabla se llama diferente, cámbia "dbo.clientes" arriba.

def migrate_clients(conn_src, conn_sb):
    log.info("━━━━ MIGRACIÓN: Clientes → entities ━━━━")
    cur_src = conn_src.cursor()
    cur_sb  = conn_sb.cursor()

    cur_src.execute(CLIENTS_QUERY)
    rows = cur_src.fetchall()
    total = len(rows)
    log.info(f"📦 {total} clientes encontrados en origen")

    ok = 0
    for i, row in enumerate(rows):
        legacy_id = row[0]
        try:
            new_id = get_or_create_uuid(cur_sb, "CLIENTE", legacy_id)

            # Mapeo de campos origen → VANTIA
            first_name = normalize_name(clean_str(row[1], 100)) or "Sin nombre"
            last_name  = normalize_name(clean_str(row[2], 150)) if row[2] else None
            nif        = clean_nif(row[4])

            # Comprobación mínima
            if not nif or nif == "DESCONOCIDO":
                log_error("CLIENTE", legacy_id, "NIF vacío o inválido", row)
                continue

            cur_sb.execute("""
                INSERT INTO entities (
                    id, type, first_name, last_name, nif_cif, email,
                    phone_1, phone_2, phone_mobile,
                    address_street, address_cp, address_town, address_province,
                    date_alta, date_baja,
                    legal_nature, client_status, lopd,
                    created_by, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s,
                    %s, %s, %s,
                    %s, now(), now()
                )
                ON CONFLICT (nif_cif) DO NOTHING
            """, (
                new_id,
                "CLIENTE",
                first_name,
                last_name,
                nif,
                clean_email(row[5]),
                clean_phone(row[6]),
                clean_phone(row[7]),
                clean_phone(row[8]),
                clean_str(row[9], 255),   # address_street
                clean_str(row[10], 10),   # address_cp
                clean_str(row[11], 100),  # address_town
                clean_str(row[12], 100),  # address_province
                clean_date(row[13]),      # date_alta
                clean_date(row[14]),      # date_baja
                clean_str(row[15], 50),   # legal_nature (tipo)
                "Alta" if not row[16] else clean_str(row[16], 20),
                clean_str(row[17], 20) or "Pendiente",
                "MIGRACIÓN",
            ))
            ok += 1

        except Exception as e:
            log_error("CLIENTE", legacy_id, str(e), row)
            conn_sb.rollback()  # revertir solo este batch si hay error grave
            log.warning(f"⚠️  Error en cliente {legacy_id}: {e}")
            continue

        # Commit por lotes
        if (i + 1) % BATCH_SIZE == 0:
            conn_sb.commit()
            log.info(f"   💾 Commit lote {i + 1}/{total}")

    conn_sb.commit()
    log.info(f"✅ Clientes migrados: {ok}/{total}  |  Errores: {total - ok}")

# ─────────────────────────────────────────────────────────────────────
# MIGRACIÓN: EXPEDIENTES → expedientes
# ─────────────────────────────────────────────────────────────────────

EXPEDIENTES_QUERY = """
    SELECT
        exp_id,
        exp_numero,
        exp_anio,
        exp_descripcion,
        exp_tipo,
        exp_cliente_id,
        exp_cliente_nombre,
        exp_contrario,
        exp_juzgado,
        exp_tipo_proc,
        exp_num_autos,
        exp_estado,
        exp_fecha_inicio,
        exp_fecha_cierre,
        exp_importe,
        exp_observaciones,
        exp_procurador
    FROM dbo.expedientes
    ORDER BY exp_anio, exp_numero
"""

def migrate_expedientes(conn_src, conn_sb):
    log.info("━━━━ MIGRACIÓN: Expedientes ━━━━")
    cur_src = conn_src.cursor()
    cur_sb  = conn_sb.cursor()

    cur_src.execute(EXPEDIENTES_QUERY)
    rows = cur_src.fetchall()
    total = len(rows)
    log.info(f"📦 {total} expedientes encontrados en origen")

    ok = 0
    for i, row in enumerate(rows):
        legacy_id = row[0]
        try:
            new_id   = get_or_create_uuid(cur_sb, "EXPEDIENTE", legacy_id)
            anio     = int(row[2]) if row[2] else datetime.now().year
            num_exp  = int(row[1]) if row[1] else 0

            # Resolver UUID del cliente desde la tabla de mapeo
            cliente_uuid = None
            if row[5]:
                cur_sb.execute(
                    "SELECT new_uuid FROM migration_map WHERE entity_type='CLIENTE' AND legacy_id=%s",
                    (str(row[5]),)
                )
                r = cur_sb.fetchone()
                cliente_uuid = str(r[0]) if r else None

            estado_map = {
                "abierto": "abierto", "cerrado": "cerrado",
                "suspendido": "suspendido", "archivado": "archivado",
                "activo": "abierto", "inactivo": "cerrado",
                "finalizado": "cerrado",
            }
            estado_raw = clean_str(row[11], 20) or "abierto"
            estado = estado_map.get(estado_raw.lower(), "abierto")

            cur_sb.execute("""
                INSERT INTO expedientes (
                    id, anio, num_exp, descripcion, tipo,
                    cliente_id, cliente_nombre, contrario,
                    juzgado, tipo_proc, num_autos,
                    estado, fecha_inicio, fecha_cierre,
                    importe, observaciones, procurador,
                    created_by, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, now(), now()
                )
                ON CONFLICT (anio, num_exp) DO NOTHING
            """, (
                new_id, anio, num_exp,
                clean_str(row[3]),
                clean_str(row[4], 60) or "judicial",
                cliente_uuid,
                clean_str(row[6], 200),
                clean_str(row[7], 200),
                clean_str(row[8], 200),
                clean_str(row[9], 100),
                clean_str(row[10], 100),
                estado,
                clean_date(row[12]),
                clean_date(row[13]),
                float(row[14]) if row[14] else None,
                clean_str(row[15]),
                clean_str(row[16], 200),
                "MIGRACIÓN",
            ))
            ok += 1

        except Exception as e:
            log_error("EXPEDIENTE", legacy_id, str(e), row)
            conn_sb.rollback()
            log.warning(f"⚠️  Error en expediente {legacy_id}: {e}")
            continue

        if (i + 1) % BATCH_SIZE == 0:
            conn_sb.commit()
            log.info(f"   💾 Commit lote {i + 1}/{total}")

    conn_sb.commit()
    log.info(f"✅ Expedientes migrados: {ok}/{total}  |  Errores: {total - ok}")

# ─────────────────────────────────────────────────────────────────────
# MIGRACIÓN: TAREAS → client_tasks
# ─────────────────────────────────────────────────────────────────────

TAREAS_QUERY = """
    SELECT
        tar_id,
        tar_titulo,
        tar_descripcion,
        tar_plazo,
        tar_estado,
        tar_prioridad,
        tar_cliente_id,
        tar_expediente_id,
        tar_creado_por
    FROM dbo.tareas
    ORDER BY tar_id
"""

def migrate_tareas(conn_src, conn_sb):
    log.info("━━━━ MIGRACIÓN: Tareas ━━━━")
    cur_src = conn_src.cursor()
    cur_sb  = conn_sb.cursor()

    try:
        cur_src.execute(TAREAS_QUERY)
    except Exception:
        log.info("   ℹ️  No se encontró tabla de tareas en origen — saltando")
        return

    rows = cur_src.fetchall()
    total = len(rows)
    log.info(f"📦 {total} tareas encontradas en origen")

    ok = 0
    for i, row in enumerate(rows):
        legacy_id = row[0]
        try:
            # Resolver UUID del cliente
            cur_sb.execute(
                "SELECT new_uuid FROM migration_map WHERE entity_type='CLIENTE' AND legacy_id=%s",
                (str(row[6]),)
            )
            r = cur_sb.fetchone()
            if not r:
                log_error("TAREA", legacy_id, "Cliente no encontrado en mapeo", row)
                continue
            cliente_uuid = str(r[0])

            estado_map = {
                "pendiente": "pendiente", "urgente": "urgente",
                "completada": "completada", "hecho": "completada",
                "realizada": "completada", "cancelada": "completada",
            }
            estado_raw = clean_str(row[4], 20) or "pendiente"
            estado = estado_map.get(estado_raw.lower(), "pendiente")

            prioridad_map = {
                "alta": "alta", "media": "media", "baja": "baja",
                "urgente": "alta", "normal": "media",
            }
            prioridad_raw = clean_str(row[5], 10) or "media"
            prioridad = prioridad_map.get(prioridad_raw.lower(), "media")

            cur_sb.execute("""
                INSERT INTO client_tasks (
                    id, client_id, titulo, descripcion,
                    plazo, estado, prioridad,
                    created_by, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s,
                    %s, %s, %s,
                    %s, now(), now()
                )
            """, (
                cliente_uuid,
                clean_str(row[1], 500) or "Sin título",
                clean_str(row[2]),
                clean_date(row[3]),
                estado,
                prioridad,
                clean_str(row[8], 150) or "MIGRACIÓN",
            ))
            ok += 1

        except Exception as e:
            log_error("TAREA", legacy_id, str(e), row)
            log.warning(f"⚠️  Error en tarea {legacy_id}: {e}")
            continue

        if (i + 1) % BATCH_SIZE == 0:
            conn_sb.commit()
            log.info(f"   💾 Commit lote {i + 1}/{total}")

    conn_sb.commit()
    log.info(f"✅ Tareas migradas: {ok}/{total}  |  Errores: {total - ok}")

# ─────────────────────────────────────────────────────────────────────
# VALIDACIÓN POST-MIGRACIÓN
# ─────────────────────────────────────────────────────────────────────

def validate(conn_src, conn_sb):
    log.info("━━━━ VALIDACIÓN ━━━━")
    cur_src = conn_src.cursor()
    cur_sb  = conn_sb.cursor()

    checks = [
        ("Clientes",     "SELECT COUNT(*) FROM dbo.clientes",    "SELECT COUNT(*) FROM entities WHERE created_by='MIGRACIÓN'"),
        ("Expedientes",  "SELECT COUNT(*) FROM dbo.expedientes", "SELECT COUNT(*) FROM expedientes WHERE created_by='MIGRACIÓN'"),
    ]

    all_ok = True
    for label, q_src, q_sb in checks:
        try:
            cur_src.execute(q_src)
            n_src = cur_src.fetchone()[0]
            cur_sb.execute(q_sb)
            n_sb  = cur_sb.fetchone()[0]
            errores = len([r for r in error_rows if r["entity_type"].upper() in label.upper()])
            esperados = n_src - errores
            ok = n_sb >= esperados * 0.98  # tolerancia del 2% por duplicados/NIFs inválidos
            icon = "✅" if ok else "❌"
            log.info(f"   {icon} {label}: origen={n_src}  destino={n_sb}  errores_etl={errores}")
            if not ok:
                all_ok = False
        except Exception as e:
            log.warning(f"   ⚠️  No se pudo validar {label}: {e}")

    if all_ok:
        log.info("✅ Validación superada")
    else:
        log.error("❌ Validación fallida — revisa el CSV de errores")

# ─────────────────────────────────────────────────────────────────────
# ORQUESTADOR PRINCIPAL
# ─────────────────────────────────────────────────────────────────────

def main():
    log.info("═" * 60)
    log.info("  VANTIA Legis ERP — ETL de Migración")
    log.info(f"  Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("═" * 60)

    conn_src = conn_sb = None
    try:
        conn_src = connect_source()
        conn_sb  = connect_supabase()

        # Preparar tabla de mapeo
        cur = conn_sb.cursor()
        ensure_migration_map(cur)
        conn_sb.commit()

        # ── Ejecutar migraciones en orden de dependencias ──
        migrate_clients(conn_src, conn_sb)
        migrate_expedientes(conn_src, conn_sb)
        migrate_tareas(conn_src, conn_sb)

        # ── Actualizar secuencia de internal_number ──
        cur.execute("SELECT setval('entities_internal_number_seq', COALESCE(MAX(internal_number), 1)) FROM entities;")
        conn_sb.commit()
        log.info("✅ Secuencia internal_number actualizada")

        # ── Validación ──
        validate(conn_src, conn_sb)

    except Exception as e:
        log.error(f"❌ Error crítico: {e}")
        if conn_sb:
            conn_sb.rollback()
        raise

    finally:
        if conn_src: conn_src.close()
        if conn_sb:  conn_sb.close()

        # Guardar CSV de errores
        if error_rows:
            with open(ERROR_CSV, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=["entity_type","legacy_id","reason","raw_data","ts"])
                writer.writeheader()
                writer.writerows(error_rows)
            log.warning(f"⚠️  {len(error_rows)} errores guardados en: {ERROR_CSV}")
        else:
            log.info("🎉 Sin errores — no se generó CSV")

        log.info(f"  Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        log.info(f"  Log completo en: {LOG_FILE}")


if __name__ == "__main__":
    main()
