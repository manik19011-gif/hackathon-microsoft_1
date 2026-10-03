"""Audit-log storage. PostgreSQL when DATABASE_URL is set, otherwise a local SQLite file."""
import json, os, sqlite3
from pathlib import Path

SQLITE = Path(__file__).resolve().parent / "audit.db"
COLS = "ts TEXT, run_id TEXT, invoice_id TEXT, actor TEXT, decision TEXT, detail TEXT"


def url(): return os.getenv("DATABASE_URL", "")
def backend(): return "postgres" if url().startswith("postgres") else "sqlite"


def sql(query, params=(), many=False, fetch=False):
    pg = backend() == "postgres"
    if pg:
        import psycopg
        from psycopg.rows import dict_row
        c = psycopg.connect(url(), row_factory=dict_row)
        ddl, query = f"CREATE TABLE IF NOT EXISTS audit(id SERIAL PRIMARY KEY, {COLS})", query.replace("?", "%s")
    else:
        c = sqlite3.connect(SQLITE); c.row_factory = sqlite3.Row
        ddl = f"CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, {COLS})"
    try:
        cur = c.cursor()
        cur.execute(ddl)
        cur.execute("CREATE TABLE IF NOT EXISTS runs(run_id TEXT PRIMARY KEY, created TEXT, payload TEXT)")
        cur.execute("CREATE TABLE IF NOT EXISTS source(run_id TEXT PRIMARY KEY, payload TEXT)")
        cur.execute("CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT)")
        cur.executemany(query, params) if many else cur.execute(query, params)
        out = [dict(r) for r in cur.fetchall()] if fetch else None
        c.commit()
        return out
    finally:
        c.close()


def save_run(run_id, created, payload):
    """Keep the latest results so a server restart does not lose them (also stores reviewer decisions)."""
    sql("DELETE FROM runs WHERE run_id = ?", (run_id,))
    sql("INSERT INTO runs(run_id, created, payload) VALUES (?, ?, ?)", (run_id, created, json.dumps(payload, default=str)))
    sql("DELETE FROM runs WHERE run_id NOT IN (SELECT run_id FROM runs ORDER BY created DESC LIMIT 5)")   # keep the last 5 runs


def load_latest():
    rows = sql("SELECT run_id, payload FROM runs ORDER BY created DESC, run_id DESC LIMIT 1", fetch=True)
    return (rows[0]["run_id"], json.loads(rows[0]["payload"])) if rows else (None, None)


def save_source(run_id, records):
    """Keep the uploaded rows of the latest run so changed limits can re-check them after a restart."""
    sql("DELETE FROM source")
    sql("INSERT INTO source(run_id, payload) VALUES (?, ?)", (run_id, json.dumps(records, default=str)))


def load_source():
    rows = sql("SELECT payload FROM source LIMIT 1", fetch=True)
    return json.loads(rows[0]["payload"]) if rows else None


def set_setting(k, v):
    sql("DELETE FROM settings WHERE k = ?", (k,))
    sql("INSERT INTO settings(k, v) VALUES (?, ?)", (k, v))


def get_setting(k):
    rows = sql("SELECT v FROM settings WHERE k = ?", (k,), fetch=True)
    return rows[0]["v"] if rows else None
