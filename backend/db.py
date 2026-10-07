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
        cur.execute("CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, department TEXT DEFAULT '', created TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf_hash TEXT NOT NULL, expires TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS user_mfa(user_id TEXT PRIMARY KEY, secret TEXT DEFAULT '', pending_secret TEXT DEFAULT '', enabled INTEGER NOT NULL DEFAULT 0)")
        cur.execute("CREATE TABLE IF NOT EXISTS employee_requests(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, reviewer TEXT DEFAULT '', review_note TEXT DEFAULT '')")
        for col in ("amount REAL DEFAULT 0", "vendor TEXT DEFAULT ''", "receipt_name TEXT DEFAULT ''"):
            try: cur.execute(f"ALTER TABLE employee_requests ADD COLUMN {col}")
            except Exception: pass
        cur.execute("CREATE TABLE IF NOT EXISTS vendors(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, tax_id TEXT DEFAULT '', bank_account TEXT DEFAULT '', routing_number TEXT DEFAULT '', iban TEXT DEFAULT '', category TEXT DEFAULT '', verified INTEGER NOT NULL DEFAULT 1, notes TEXT DEFAULT '', updated TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS vendor_alerts(id TEXT PRIMARY KEY, invoice_id TEXT, vendor TEXT, alert_type TEXT, detail TEXT, severity TEXT, created TEXT NOT NULL, status TEXT DEFAULT 'open')")
        cur.execute("CREATE TABLE IF NOT EXISTS purchase_orders(po_number TEXT PRIMARY KEY, vendor TEXT NOT NULL, line_items TEXT NOT NULL, total_amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'open', created TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS goods_receipts(id TEXT PRIMARY KEY, po_number TEXT NOT NULL, item_name TEXT NOT NULL, quantity_received REAL NOT NULL, received_date TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS webhooks(id TEXT PRIMARY KEY, url TEXT NOT NULL, secret TEXT DEFAULT '', events TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS webhook_logs(id TEXT PRIMARY KEY, webhook_id TEXT, event TEXT, status_code INTEGER, response TEXT, created TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS corporate_card_txns(id TEXT PRIMARY KEY, employee TEXT NOT NULL, vendor TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, card_last4 TEXT DEFAULT '4021')")
        cur.execute("CREATE TABLE IF NOT EXISTS sanctions_watchlist(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, entity_type TEXT DEFAULT 'company', country TEXT DEFAULT '', list_source TEXT DEFAULT 'OFAC SDN', notes TEXT DEFAULT '')")
        cur.execute("CREATE TABLE IF NOT EXISTS vendor_disputes(id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, vendor TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT DEFAULT 'draft', created TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', url TEXT DEFAULT '', audience TEXT NOT NULL DEFAULT 'all', created TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS access_controls(role TEXT NOT NULL, feature TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(role, feature))")
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


def bootstrap_enterprise_data():
    """Seed initial trusted vendors and purchase orders for enterprise compliance."""
    existing_vendors = sql("SELECT COUNT(*) AS c FROM vendors", fetch=True)
    if existing_vendors and existing_vendors[0]["c"] == 0:
        vendors = [
            ("vnd-acme", "Acme Office Supplies", "12-3456789", "48219034", "021000021", "US89CHAS02100002148219034", "Office Supplies", 1, "Tier-1 office supplier with contracted enterprise pricing", "2026-08-01 09:00:00"),
            ("vnd-adwave", "AdWave Media", "23-4567890", "91024589", "121140399", "US12SVBK12114039991024589", "Marketing", 1, "Digital advertising & branding agency", "2026-08-01 09:00:00"),
            ("vnd-bright", "Brightline Consulting", "34-5678901", "67341209", "026009593", "US45BOFA02600959367341209", "Consulting", 1, "Strategic IT and management consultancy", "2026-08-01 09:00:00"),
            ("vnd-cafe", "Cafe Bloom", "45-6789012", "12908841", "121000248", "US33WELL12100024812908841", "Meals", 1, "Catering and executive lunch provider", "2026-08-01 09:00:00"),
            ("vnd-cloud", "CloudNine Software", "56-7890123", "55319402", "021000089", "US77CITI02100008955319402", "Software", 1, "Cloud infrastructure & SaaS licensing provider", "2026-08-01 09:00:00"),
            ("vnd-power", "PowerGrid Utilities", "67-8901234", "88421095", "071921891", "US55PNCC07192189188421095", "Utilities", 1, "Commercial electricity & municipal power utility", "2026-08-01 09:00:00"),
            ("vnd-sky", "SkyHigh Travels", "78-9012345", "30198823", "051405515", "US22CAPO05140551530198823", "Travel", 1, "Corporate corporate booking and flights agency", "2026-08-01 09:00:00"),
            ("vnd-unv", "Apex Global Logistics", "99-1122334", "77123991", "111000025", "US44CHAS11100002577123991", "Logistics", 0, "New supplier undergoing KYC and bank verification hold", "2026-09-01 10:00:00"),
        ]
        sql("INSERT INTO vendors(id,name,tax_id,bank_account,routing_number,iban,category,verified,notes,updated) VALUES (?,?,?,?,?,?,?,?,?,?)", vendors, many=True)

    existing_pos = sql("SELECT COUNT(*) AS c FROM purchase_orders", fetch=True)
    if existing_pos and existing_pos[0]["c"] == 0:
        pos = [
            ("PO-2026-001", "Brightline Consulting", "IT Architecture Review (80 hrs)", 3203.26, "open", "2026-07-25"),
            ("PO-2026-002", "CloudNine Software", "Annual Enterprise SaaS Seat Subscriptions", 2549.47, "open", "2026-08-15"),
            ("PO-2026-003", "AdWave Media", "Q3 Brand Awareness Search Campaign", 3000.00, "open", "2026-08-01"),
            ("PO-2026-004", "Acme Office Supplies", "Office workstations & ergonomic chairs", 1200.00, "closed", "2026-06-10"),
            ("PO-2026-005", "PowerGrid Utilities", "Datacenter Backup Power Facility Contract", 5000.00, "open", "2026-08-01"),
        ]
        sql("INSERT INTO purchase_orders(po_number,vendor,line_items,total_amount,status,created) VALUES (?,?,?,?,?,?)", pos, many=True)

    existing_sanctions = sql("SELECT COUNT(*) AS c FROM sanctions_watchlist", fetch=True)
    if existing_sanctions and existing_sanctions[0]["c"] == 0:
        sanctions = [
            ("sanc-1", "Vektor Logistics Global", "company", "Cyprus / High Risk", "OFAC SDN", "Special Designated Nationals List - Export controls"),
            ("sanc-2", "Al-Baraka Wire Ltd", "company", "UAE / High Risk", "EU Financial Sanctions", "Designated under AML anti-money laundering embargo"),
            ("sanc-3", "Rosneft Supply Corp", "company", "Russia", "OFAC Sectoral Sanctions", "Energy sectoral sanctions list"),
            ("sanc-4", "Zhongxin Trade Holding", "company", "Hong Kong", "UK HMT Sanctions", "Targeted trade embargo watchlist"),
        ]
        sql("INSERT INTO sanctions_watchlist(id,name,entity_type,country,list_source,notes) VALUES (?,?,?,?,?,?)", sanctions, many=True)

    existing_cards = sql("SELECT COUNT(*) AS c FROM corporate_card_txns", fetch=True)
    if existing_cards and existing_cards[0]["c"] == 0:
        cards = [
            ("card-101", "Aarav Mehta", "Cafe Bloom", 83.35, "2026-08-26", "4819"),
            ("card-102", "Vikram Rao", "SkyHigh Travels", 749.46, "2026-08-08", "4819"),
            ("card-103", "Sara Khan", "Acme Office Supplies", 154.58, "2026-09-24", "9012"),
            ("card-104", "Priya Nair", "Cafe Bloom", 98.41, "2026-08-16", "3321"),
        ]
        sql("INSERT INTO corporate_card_txns(id,employee,vendor,amount,date,card_last4) VALUES (?,?,?,?,?,?)", cards, many=True)

