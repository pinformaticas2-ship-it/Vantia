"""
╔══════════════════════════════════════════════════════════════════╗
║   VANTIA Legis — Migración: lextech_db (local) → Supabase       ║
╚══════════════════════════════════════════════════════════════════╝

Requisitos:
    pip install psycopg2-binary

Uso:
    python migrate_to_supabase.py

⚠️  Pon tu contraseña de Supabase en SUPABASE_CONN antes de ejecutar.
"""

import os
import psycopg2
import psycopg2.extras
import uuid
import logging
import csv
from datetime import datetime

# ─────────────────────────────────────────────────────────────────────
# CONEXIONES  ← solo cambia la contraseña de Supabase
# ─────────────────────────────────────────────────────────────────────

LOCAL_CONN = os.getenv("LOCAL_CONN", "postgresql://admin:Elena2026@localhost:5432/lextech_db")

SUPABASE_CONN = os.getenv(
    "SUPABASE_CONN",
    "postgresql://postgres.dnkjcxphvrndnbmgjfco:AimarElena2026@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
)
# Puedes sobrescribir ambas con variables de entorno al ejecutar el script.

BATCH_SIZE = 200

# ─────────────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────────────

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler(f"migration_{ts}.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)
errors = []

def log_error(tabla, id_, motivo, fila=None):
    errors.append({"tabla": tabla, "id": str(id_), "motivo": motivo, "fila": str(fila)[:200]})
    log.warning(f"⚠️  [{tabla}] id={id_} — {motivo}")

# ─────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────

def get_or_create_uuid(cur_sb, entity_type: str, legacy_id: str) -> str:
    cur_sb.execute(
        "SELECT new_uuid FROM migration_map WHERE entity_type=%s AND legacy_id=%s",
        (entity_type, str(legacy_id))
    )
    row = cur_sb.fetchone()
    if row:
        return str(row[0])
    new_id = str(uuid.uuid4())
    cur_sb.execute(
        "INSERT INTO migration_map (entity_type, legacy_id, new_uuid) VALUES (%s,%s,%s)",
        (entity_type, str(legacy_id), new_id)
    )
    return new_id

def commit_batch(conn, i, total, label):
    if (i + 1) % BATCH_SIZE == 0:
        conn.commit()
        log.info(f"   💾 {label}: {i+1}/{total} registros")

# ─────────────────────────────────────────────────────────────────────
# 1. ENTITIES (clientes)
# ─────────────────────────────────────────────────────────────────────

def migrate_entities(conn_local, conn_sb):
    log.info("━━━━ Migrando: entities ━━━━")
    cur_l = conn_local.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur_s = conn_sb.cursor()

    cur_l.execute("SELECT * FROM entities ORDER BY created_at")
    rows = cur_l.fetchall()
    log.info(f"   📦 {len(rows)} registros encontrados")

    ok = 0
    for i, row in enumerate(rows):
        try:
            new_id = get_or_create_uuid(cur_s, "ENTITY", str(row["id"]))
            cur_s.execute("""
                INSERT INTO entities (
                    id, type, first_name, last_name, commercial_name,
                    nif_cif, email, phone_1, phone_2, phone_mobile,
                    phone_fax, website, address_street, address_cp,
                    address_town, address_province, address_country,
                    client_status, document_type, gender, birth_date,
                    nationality, expedition_country, legal_nature,
                    date_alta, date_baja, lopd, commercial_communications,
                    center, photo_url, dni_image_url, internal_number,
                    created_by, created_at, updated_at
                ) VALUES (
                    %s,%s,%s,%s,%s, %s,%s,%s,%s,%s,
                    %s,%s,%s,%s, %s,%s,%s,
                    %s,%s,%s,%s, %s,%s,%s,
                    %s,%s,%s,%s, %s,%s,%s,%s,
                    %s,%s,%s
                )
                ON CONFLICT (nif_cif) DO NOTHING
            """, (
                new_id,
                row["type"], row["first_name"], row["last_name"],
                row["commercial_name"], row["nif_cif"], row["email"],
                row["phone_1"], row["phone_2"], row["phone_mobile"],
                row["phone_fax"], row["website"],
                row["address_street"], row["address_cp"],
                row["address_town"], row["address_province"], row["address_country"],
                row["client_status"], row["document_type"], row["gender"],
                row["birth_date"], row["nationality"], row["expedition_country"],
                row["legal_nature"], row["date_alta"], row["date_baja"],
                row["lopd"], row["commercial_communications"],
                row["center"], row["photo_url"], row["dni_image_url"],
                row["internal_number"], row["created_by"],
                row["created_at"], row["updated_at"],
            ))
            ok += 1
        except Exception as e:
            conn_sb.rollback()
            log_error("entities", row["id"], str(e), dict(row))
            continue

        commit_batch(conn_sb, i, len(rows), "entities")

    conn_sb.commit()
    log.info(f"   ✅ entities: {ok}/{len(rows)}")

# ─────────────────────────────────────────────────────────────────────
# 2. EXPEDIENTES
# ─────────────────────────────────────────────────────────────────────

def migrate_expedientes(conn_local, conn_sb):
    log.info("━━━━ Migrando: expedientes ━━━━")
    cur_l = conn_local.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur_s = conn_sb.cursor()

    cur_l.execute("SELECT * FROM expedientes ORDER BY anio, num_exp")
    rows = cur_l.fetchall()
    log.info(f"   📦 {len(rows)} registros encontrados")

    ok = 0
    for i, row in enumerate(rows):
        try:
            new_id = get_or_create_uuid(cur_s, "EXPEDIENTE", str(row["id"]))

            # Resolver UUID del cliente en Supabase
            cliente_uuid = None
            if row["cliente_id"]:
                cur_s.execute(
                    "SELECT new_uuid FROM migration_map WHERE entity_type='ENTITY' AND legacy_id=%s",
                    (str(row["cliente_id"]),)
                )
                r = cur_s.fetchone()
                cliente_uuid = str(r[0]) if r else None

            cur_s.execute("""
                INSERT INTO expedientes (
                    id, anio, num_exp, ref_propia, descripcion, tipo,
                    cliente_id, cliente_nombre, contrario, procurador,
                    juzgado, tipo_proc, num_autos, nig, estado,
                    observaciones, fecha_inicio, fecha_cierre, importe,
                    tipos_asunto, cuantia_principal, intereses, costas,
                    cuantia_total, indeterminado, etapa,
                    persona_contacto, contacto, centro, color,
                    ref_expediente, created_by, created_at, updated_at
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,
                    %s,%s,%s,%s,%s,
                    %s,%s,%s,%s,
                    %s,%s,%s,%s,
                    %s,%s,%s,
                    %s,%s,%s,%s,
                    %s,%s,%s,%s
                )
                ON CONFLICT (anio, num_exp) DO NOTHING
            """, (
                new_id,
                row["anio"], row["num_exp"], row["ref_propia"],
                row["descripcion"], row["tipo"],
                cliente_uuid, row["cliente_nombre"], row["contrario"],
                row["procurador"], row["juzgado"], row["tipo_proc"],
                row["num_autos"], row["nig"], row["estado"],
                row["observaciones"], row["fecha_inicio"], row["fecha_cierre"],
                row["importe"], row["tipos_asunto"], row["cuantia_principal"],
                row["intereses"], row["costas"], row["cuantia_total"],
                row["indeterminado"], row["etapa"],
                row["persona_contacto"], row["contacto"], row["centro"],
                row["color"], row["ref_expediente"],
                row["created_by"], row["created_at"], row["updated_at"],
            ))
            ok += 1
        except Exception as e:
            conn_sb.rollback()
            log_error("expedientes", row["id"], str(e), dict(row))
            continue

        commit_batch(conn_sb, i, len(rows), "expedientes")

    conn_sb.commit()
    log.info(f"   ✅ expedientes: {ok}/{len(rows)}")

# ─────────────────────────────────────────────────────────────────────
# 3. CLIENT_TASKS (tareas)
# ─────────────────────────────────────────────────────────────────────

def migrate_tasks(conn_local, conn_sb):
    log.info("━━━━ Migrando: client_tasks ━━━━")
    cur_l = conn_local.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur_s = conn_sb.cursor()

    cur_l.execute("SELECT * FROM client_tasks ORDER BY created_at")
    rows = cur_l.fetchall()
    log.info(f"   📦 {len(rows)} registros encontrados")

    ok = 0
    for i, row in enumerate(rows):
        try:
            # Resolver UUID del cliente
            cur_s.execute(
                "SELECT new_uuid FROM migration_map WHERE entity_type='ENTITY' AND legacy_id=%s",
                (str(row["client_id"]),)
            )
            r = cur_s.fetchone()
            if not r:
                log_error("client_tasks", row["id"], "client_id no encontrado en mapeo")
                continue
            cliente_uuid = str(r[0])

            cur_s.execute("""
                INSERT INTO client_tasks (
                    id, client_id, user_id, client_name, expediente_id,
                    titulo, descripcion, plazo, estado, prioridad,
                    tipo, juzgado, num_proc, fecha_aviso,
                    importe, notas, etapa,
                    created_by, created_at, updated_at
                ) VALUES (
                    %s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,
                    %s,%s,%s,%s,
                    %s,%s,%s,
                    %s,%s,%s
                )
            """, (
                str(row["id"]), cliente_uuid,
                row["user_id"], row["client_name"],
                str(row["expediente_id"]) if row["expediente_id"] else None,
                row["titulo"], row["descripcion"], row["plazo"],
                row["estado"], row["prioridad"], row["tipo"],
                row["juzgado"], row["num_proc"], row["fecha_aviso"],
                row["importe"], row["notas"], row["etapa"],
                row["created_by"], row["created_at"], row["updated_at"],
            ))
            ok += 1
        except Exception as e:
            conn_sb.rollback()
            log_error("client_tasks", row["id"], str(e))
            continue

        commit_batch(conn_sb, i, len(rows), "client_tasks")

    conn_sb.commit()
    log.info(f"   ✅ client_tasks: {ok}/{len(rows)}")

# ─────────────────────────────────────────────────────────────────────
# 4. AGENDA_EVENTS
# ─────────────────────────────────────────────────────────────────────

def migrate_agenda(conn_local, conn_sb):
    log.info("━━━━ Migrando: agenda_events ━━━━")
    cur_l = conn_local.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur_s = conn_sb.cursor()

    cur_l.execute("SELECT * FROM agenda_events ORDER BY start_at")
    rows = cur_l.fetchall()
    log.info(f"   📦 {len(rows)} registros encontrados")

    ok = 0
    for i, row in enumerate(rows):
        try:
            cur_s.execute("""
                INSERT INTO agenda_events (
                    id, user_id, user_name, title, description,
                    start_at, end_at, all_day, type, status,
                    expediente_id, cliente_id, location, color,
                    created_at, updated_at
                ) VALUES (
                    %s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,
                    %s,%s,%s,%s,
                    %s,%s
                )
                ON CONFLICT DO NOTHING
            """, (
                str(row["id"]), row["user_id"], row["user_name"],
                row["title"], row["description"],
                row["start_at"], row["end_at"], row["all_day"],
                row["type"], row["status"],
                str(row["expediente_id"]) if row["expediente_id"] else None,
                str(row["cliente_id"]) if row["cliente_id"] else None,
                row["location"], row["color"],
                row["created_at"], row["updated_at"],
            ))
            ok += 1
        except Exception as e:
            conn_sb.rollback()
            log_error("agenda_events", row["id"], str(e))
            continue

        commit_batch(conn_sb, i, len(rows), "agenda_events")

    conn_sb.commit()
    log.info(f"   ✅ agenda_events: {ok}/{len(rows)}")

# ─────────────────────────────────────────────────────────────────────
# 5. NOTES
# ─────────────────────────────────────────────────────────────────────

def migrate_notes(conn_local, conn_sb):
    log.info("━━━━ Migrando: notes ━━━━")
    cur_l = conn_local.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur_s = conn_sb.cursor()

    cur_l.execute("SELECT * FROM notes ORDER BY created_at")
    rows = cur_l.fetchall()
    log.info(f"   📦 {len(rows)} registros encontrados")

    ok = 0
    for i, row in enumerate(rows):
        try:
            # Resolver UUID del cliente
            cur_s.execute(
                "SELECT new_uuid FROM migration_map WHERE entity_type='ENTITY' AND legacy_id=%s",
                (str(row["client_id"]),)
            )
            r = cur_s.fetchone()
            client_uuid = str(r[0]) if r else str(row["client_id"])

            cur_s.execute("""
                INSERT INTO notes (
                    id, client_id, content, category, priority,
                    color, created_by, created_at, updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING
            """, (
                str(row["id"]), client_uuid,
                row["content"], row["category"], row["priority"],
                row["color"], row["created_by"],
                row["created_at"], row["updated_at"],
            ))
            ok += 1
        except Exception as e:
            conn_sb.rollback()
            log_error("notes", row["id"], str(e))
            continue

        commit_batch(conn_sb, i, len(rows), "notes")

    conn_sb.commit()
    log.info(f"   ✅ notes: {ok}/{len(rows)}")

# ─────────────────────────────────────────────────────────────────────
# VALIDACIÓN FINAL
# ─────────────────────────────────────────────────────────────────────

TABLAS = [
    "entities", "expedientes", "client_tasks",
    "agenda_events", "notes",
]

def validate(conn_local, conn_sb):
    log.info("━━━━ VALIDACIÓN ━━━━")
    cur_l = conn_local.cursor()
    cur_s = conn_sb.cursor()
    for tabla in TABLAS:
        try:
            cur_l.execute(f"SELECT COUNT(*) FROM {tabla}")
            n_local = cur_l.fetchone()[0]
            cur_s.execute(f"SELECT COUNT(*) FROM {tabla}")
            n_sb = cur_s.fetchone()[0]
            icon = "✅" if n_sb >= n_local * 0.97 else "❌"
            log.info(f"   {icon}  {tabla:<25} local={n_local:>6}  supabase={n_sb:>6}")
        except Exception as e:
            log.warning(f"   ⚠️  No se pudo validar {tabla}: {e}")

# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────

def main():
    log.info("═" * 60)
    log.info("  VANTIA — Migración local → Supabase")
    log.info(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("═" * 60)

    conn_l = conn_s = None
    try:
        log.info("🔌 Conectando a lextech_db (local)...")
        conn_l = psycopg2.connect(LOCAL_CONN)

        log.info("🔌 Conectando a Supabase...")
        conn_s = psycopg2.connect(SUPABASE_CONN)
        conn_s.autocommit = False

        # Crear tabla de mapeo
        cur = conn_s.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS migration_map (
                entity_type TEXT,
                legacy_id   TEXT,
                new_uuid    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                migrated_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_migration_map_legacy
                ON migration_map (entity_type, legacy_id);
        """)
        conn_s.commit()

        # ── Migraciones en orden ──
        migrate_entities(conn_l, conn_s)
        migrate_expedientes(conn_l, conn_s)
        migrate_tasks(conn_l, conn_s)
        migrate_agenda(conn_l, conn_s)
        migrate_notes(conn_l, conn_s)

        # Actualizar secuencia de numeración
        cur.execute("""
            SELECT setval(
                'entities_internal_number_seq',
                COALESCE((SELECT MAX(internal_number) FROM entities), 1)
            );
        """)
        conn_s.commit()

        validate(conn_l, conn_s)

    except Exception as e:
        log.error(f"❌ Error crítico: {e}")
        if conn_s: conn_s.rollback()
        raise
    finally:
        if conn_l: conn_l.close()
        if conn_s: conn_s.close()

        # Guardar errores en CSV
        if errors:
            with open(f"errores_{ts}.csv", "w", newline="", encoding="utf-8") as f:
                csv.DictWriter(f, fieldnames=["tabla","id","motivo","fila"]).writerows(errors)
            log.warning(f"⚠️  {len(errors)} errores → errores_{ts}.csv")
        else:
            log.info("🎉 Sin errores")

        log.info(f"  Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
