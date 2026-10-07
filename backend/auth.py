"""Cookie-based authentication and role-scoped employee operations for Veri-Fi."""
import hashlib
import hmac
import base64
import os
import secrets
import struct
import time
import uuid
from urllib.parse import quote
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

import db

router = APIRouter(prefix="/api")
hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
SESSION_COOKIE = "verifi_session"
CSRF_COOKIE = "verifi_csrf"
SESSION_HOURS = 8
_attempts = {}
FEATURES = ("invoice_review", "policy_limits", "audit_log", "user_management", "employee_requests", "resources")
EMPLOYEE_FEATURES = ("employee_requests", "resources")


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _totp(secret: str, when: int | None = None) -> str:
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
    counter = int((when if when is not None else time.time()) // 30)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 15
    number = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1_000_000
    return f"{number:06d}"


def _verify_totp(secret: str, code: str) -> bool:
    current = int(time.time())
    return any(hmac.compare_digest(_totp(secret, current + offset * 30), code) for offset in (-1, 0, 1))


def _now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _audit(actor: str, action: str, detail: str):
    db.sql("INSERT INTO audit(ts,run_id,invoice_id,actor,decision,detail) VALUES (?,?,?,?,?,?)",
           (_now(), None, None, actor, action, detail[:500]))


def bootstrap():
    """Create a ready-to-demo local workspace; override the seed password with an env var."""
    admin = db.sql("SELECT id FROM users WHERE email = ?", ("admin@verifi.local",), fetch=True)
    employee = db.sql("SELECT id FROM users WHERE email = ?", ("employee@verifi.local",), fetch=True)
    if not admin:
        password = os.getenv("VERIFI_ADMIN_PASSWORD", "VeriFiAdmin!2026")
        db.sql("INSERT INTO users(id,email,name,role,password_hash,active,department,created) VALUES (?,?,?,?,?,?,?,?)",
               (str(uuid.uuid4()), "admin@verifi.local", "Veri-Fi Administrator", "admin", hasher.hash(password), 1, "Finance", _now()))
    if not employee:
        password = os.getenv("VERIFI_EMPLOYEE_PASSWORD", "VeriFiEmployee!2026")
        db.sql("INSERT INTO users(id,email,name,role,password_hash,active,department,created) VALUES (?,?,?,?,?,?,?,?)",
               (str(uuid.uuid4()), "employee@verifi.local", "Demo Employee", "employee", hasher.hash(password), 1, "Operations", _now()))
    for role in ("admin", "employee"):
        defaults = {"invoice_review": role == "admin", "policy_limits": role == "admin", "audit_log": role == "admin",
                    "user_management": role == "admin", "employee_requests": True, "resources": True}
        for feature, enabled in defaults.items():
            db.sql("INSERT INTO access_controls(role,feature,enabled) VALUES (?,?,?) ON CONFLICT(role,feature) DO NOTHING",
                   (role, feature, int(enabled)))
    existing = db.sql("SELECT id FROM resources LIMIT 1", fetch=True)
    if not existing:
        for title, description, url in [
            ("Expense policy", "Review category limits, receipt requirements, and reimbursement timelines.", "https://example.com/expense-policy"),
            ("Invoice review playbook", "How to inspect exception evidence and record a consistent human decision.", "https://example.com/review-playbook"),
            ("Finance support", "Contact the finance operations team for policy and reimbursement questions.", "mailto:finance@example.com"),
        ]:
            db.sql("INSERT INTO resources(id,title,description,url,audience,created) VALUES (?,?,?,?,?,?)",
                   (str(uuid.uuid4()), title, description, "", "all", _now()))
    db.sql("UPDATE resources SET url='' WHERE url LIKE 'https://example.com/%'")
    try:
        db.bootstrap_enterprise_data()
    except Exception as e:
        pass


def _get_user(token: str | None):
    if not token:
        raise HTTPException(401, "Please sign in to continue.")
    rows = db.sql("SELECT u.id,u.email,u.name,u.role,u.active,u.department,s.csrf_hash,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?",
                  (_digest(token),), fetch=True)
    if not rows or not rows[0]["active"]:
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    row = rows[0]
    mfa = db.sql("SELECT enabled FROM user_mfa WHERE user_id=?", (row["id"],), fetch=True)
    row["mfa_enabled"] = bool(mfa and mfa[0]["enabled"])
    if datetime.fromisoformat(row["expires"].replace("Z", "+00:00")) < datetime.now().astimezone():
        db.sql("DELETE FROM sessions WHERE token_hash=?", (_digest(token),))
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    return row


def require_user(request: Request, x_csrf_token: str | None = Header(default=None)):
    user = _get_user(request.cookies.get(SESSION_COOKIE))
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        csrf_cookie = request.cookies.get(CSRF_COOKIE, "")
        if not csrf_cookie or not x_csrf_token or not hmac.compare_digest(csrf_cookie, x_csrf_token) or not hmac.compare_digest(_digest(csrf_cookie), user["csrf_hash"]):
            raise HTTPException(403, "Request verification failed. Refresh the page and try again.")
    return user


def require_admin(user=Depends(require_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "This workspace is available to administrators only.")
    if not user.get("mfa_enabled"):
        raise HTTPException(403, "Set up authenticator-app verification before opening the administrator workspace.")
    return user


def can_access(user, feature: str):
    rows = db.sql("SELECT enabled FROM access_controls WHERE role=? AND feature=?", (user["role"], feature), fetch=True)
    if not rows or not rows[0]["enabled"]:
        raise HTTPException(403, "Your account does not have access to this feature.")


def _set_session(response: Response, user_id: str, request: Request):
    token, csrf = secrets.token_urlsafe(40), secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(hours=SESSION_HOURS)).isoformat() + "Z"
    db.sql("INSERT INTO sessions(token_hash,user_id,csrf_hash,expires) VALUES (?,?,?,?)", (_digest(token), user_id, _digest(csrf), expires))
    secure = request.url.scheme == "https" or os.getenv("VERIFI_COOKIE_SECURE", "").lower() == "true"
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=secure, samesite="strict", max_age=SESSION_HOURS * 3600, path="/")
    response.set_cookie(CSRF_COOKIE, csrf, httponly=False, secure=secure, samesite="strict", max_age=SESSION_HOURS * 3600, path="/")


def _public(user):
    mfa = db.sql("SELECT enabled FROM user_mfa WHERE user_id=?", (user["id"],), fetch=True)
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"], "department": user["department"] or "", "mfa_enabled": bool(mfa and mfa[0]["enabled"])}


class Login(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    password: str = Field(min_length=1, max_length=256)
    otp: str = Field(default="", max_length=12)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    department: str = Field(default="", max_length=100)
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str | None = Field(default=None, min_length=12, max_length=256)


class NewUser(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    name: str = Field(min_length=2, max_length=100)
    role: str = Field(pattern="^(admin|employee)$")
    department: str = Field(default="", max_length=100)
    password: str = Field(min_length=12, max_length=256)


class RequestCreate(BaseModel):
    kind: str = Field(min_length=2, max_length=60)
    title: str = Field(min_length=3, max_length=140)
    description: str = Field(min_length=5, max_length=4000)
    amount: float = Field(default=0.0)
    vendor: str = Field(default="", max_length=120)
    receipt_name: str = Field(default="", max_length=200)


class RequestReview(BaseModel):
    status: str = Field(pattern="^(approved|rejected|in_progress)$")
    note: str = Field(default="", max_length=1000)


class ResourceCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=500)
    url: str = Field(default="", max_length=1000)
    audience: str = Field(default="all", pattern="^(all|admin|employee)$")


@router.get("/auth/csrf")
def csrf(response: Response, request: Request):
    token = request.cookies.get(CSRF_COOKIE)
    if not token:
        token = secrets.token_urlsafe(32)
    secure = request.url.scheme == "https" or os.getenv("VERIFI_COOKIE_SECURE", "").lower() == "true"
    response.set_cookie(CSRF_COOKIE, token, httponly=False, secure=secure, samesite="strict", max_age=SESSION_HOURS * 3600, path="/")
    return {"ok": True}


@router.post("/auth/login")
def login(body: Login, request: Request, response: Response, x_csrf_token: str | None = Header(default=None)):
    ip = request.client.host if request.client else "unknown"
    key = (ip, body.email.lower())
    failed, until = _attempts.get(key, (0, 0))
    if until > time.time():
        raise HTTPException(429, "Too many sign-in attempts. Wait 60 seconds, then try again.")
    csrf_cookie = request.cookies.get(CSRF_COOKIE, "")
    if not csrf_cookie or not x_csrf_token or not hmac.compare_digest(csrf_cookie, x_csrf_token):
        raise HTTPException(403, "Refresh the sign-in page and try again.")
    rows = db.sql("SELECT * FROM users WHERE lower(email)=?", (body.email.lower(),), fetch=True)
    user = rows[0] if rows else None
    try:
        ok = user and user["active"] and hasher.verify(user["password_hash"], body.password)
    except VerifyMismatchError:
        ok = False
    if ok:
        mfa = db.sql("SELECT secret,enabled FROM user_mfa WHERE user_id=?", (user["id"],), fetch=True)
        if mfa and mfa[0]["enabled"] and (not body.otp or not _verify_totp(mfa[0]["secret"], body.otp.strip())):
            ok = False
    if not ok:
        failed += 1
        _attempts[key] = (0, time.time() + 60) if failed >= 5 else (failed, 0)
        _audit(body.email.lower(), "LOGIN_FAILED", "Invalid credentials")
        raise HTTPException(401, "Email or password is incorrect.")
    _attempts.pop(key, None)
    db.sql("DELETE FROM sessions WHERE user_id=?", (user["id"],))
    _set_session(response, user["id"], request)
    _audit(user["email"], "LOGIN", "Successful sign-in")
    return {"user": _public(user), "session_expires_in": SESSION_HOURS * 3600}


class EmployeeRegister(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    department: str = Field(default="", max_length=100)
    password: str = Field(min_length=8, max_length=256)


@router.post("/auth/register")
def register_employee(body: EmployeeRegister, request: Request, response: Response, x_csrf_token: str | None = Header(default=None)):
    csrf_cookie = request.cookies.get(CSRF_COOKIE, "")
    if not csrf_cookie or not x_csrf_token or not hmac.compare_digest(csrf_cookie, x_csrf_token):
        raise HTTPException(403, "Refresh the sign-up page and try again.")
    if db.sql("SELECT id FROM users WHERE lower(email)=?", (body.email.lower(),), fetch=True):
        raise HTTPException(409, "An account with this email already exists.")
    uid = str(uuid.uuid4())
    db.sql("INSERT INTO users(id,email,name,role,password_hash,active,department,created) VALUES (?,?,?,?,?,?,?,?)",
           (uid, body.email.lower(), body.name.strip(), "employee", hasher.hash(body.password), 1, body.department.strip(), _now()))
    _set_session(response, uid, request)
    _audit(body.email.lower(), "EMPLOYEE_REGISTERED", f"Self-registered employee account: {body.name.strip()} ({body.department.strip() or 'No dept'})")
    user = db.sql("SELECT * FROM users WHERE id=?", (uid,), fetch=True)[0]
    return {"user": _public(user), "session_expires_in": SESSION_HOURS * 3600}



@router.get("/auth/me")
def me(user=Depends(require_user)):
    return {"user": _public(user), "features": [r["feature"] for r in db.sql("SELECT feature FROM access_controls WHERE role=? AND enabled=1", (user["role"],), fetch=True)]}


@router.post("/auth/mfa/setup")
def mfa_setup(user=Depends(require_user)):
    if user["role"] != "admin": raise HTTPException(403, "Authenticator setup is reserved for administrators.")
    secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
    db.sql("INSERT INTO user_mfa(user_id,secret,pending_secret,enabled) VALUES (?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET pending_secret=excluded.pending_secret",
           (user["id"], "", secret))
    _audit(user["email"], "MFA_SETUP_STARTED", "Started administrator authenticator enrollment")
    label = quote("Veri-Fi:" + user["email"])
    uri = f"otpauth://totp/{label}?secret={secret}&issuer=Veri-Fi&algorithm=SHA1&digits=6&period=30"
    return {"secret": secret, "otpauth_uri": uri}


class OtpCode(BaseModel):
    code: str = Field(min_length=6, max_length=8)


@router.post("/auth/mfa/confirm")
def mfa_confirm(body: OtpCode, user=Depends(require_user)):
    if user["role"] != "admin": raise HTTPException(403, "Authenticator setup is reserved for administrators.")
    rows = db.sql("SELECT pending_secret FROM user_mfa WHERE user_id=?", (user["id"],), fetch=True)
    secret = rows[0]["pending_secret"] if rows else ""
    if not secret or not _verify_totp(secret, body.code.strip()):
        raise HTTPException(400, "That code did not match. Check your authenticator app and try again.")
    db.sql("UPDATE user_mfa SET secret=?,pending_secret='',enabled=1 WHERE user_id=?", (secret, user["id"]))
    _audit(user["email"], "MFA_ENABLED", "Enabled administrator authenticator verification")
    return {"user": _public(user)}


@router.post("/auth/logout")
def logout(request: Request, response: Response, user=Depends(require_user)):
    token = request.cookies.get(SESSION_COOKIE)
    db.sql("DELETE FROM sessions WHERE token_hash=?", (_digest(token),))
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    _audit(user["email"], "LOGOUT", "Signed out")
    return {"ok": True}


@router.put("/employee/profile")
def update_profile(body: ProfileUpdate, user=Depends(require_user)):
    rows = db.sql("SELECT password_hash FROM users WHERE id=?", (user["id"],), fetch=True)
    try:
        valid = hasher.verify(rows[0]["password_hash"], body.current_password)
    except VerifyMismatchError:
        valid = False
    if not valid:
        raise HTTPException(400, "Current password is incorrect.")
    if body.new_password:
        db.sql("UPDATE users SET name=?,department=?,password_hash=? WHERE id=?", (body.name.strip(), body.department.strip(), hasher.hash(body.new_password), user["id"]))
        db.sql("DELETE FROM sessions WHERE user_id=?", (user["id"],))
    else:
        db.sql("UPDATE users SET name=?,department=? WHERE id=?", (body.name.strip(), body.department.strip(), user["id"]))
    _audit(user["email"], "PROFILE_UPDATED", "Updated own profile" + (" and password" if body.new_password else ""))
    fresh = db.sql("SELECT * FROM users WHERE id=?", (user["id"],), fetch=True)[0]
    return {"user": _public(fresh), "password_changed": bool(body.new_password)}


@router.get("/employee/requests")
def my_requests(user=Depends(require_user)):
    can_access(user, "employee_requests")
    return db.sql("SELECT id,kind,title,description,amount,vendor,receipt_name,status,created,updated,review_note FROM employee_requests WHERE user_id=? ORDER BY created DESC", (user["id"],), fetch=True)


@router.post("/employee/requests")
def create_request(body: RequestCreate, user=Depends(require_user)):
    can_access(user, "employee_requests")
    rid = str(uuid.uuid4()); timestamp = _now()
    amt = float(body.amount or 0.0)
    db.sql("INSERT INTO employee_requests(id,user_id,kind,title,description,amount,vendor,receipt_name,status,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
           (rid, user["id"], body.kind.strip(), body.title.strip(), body.description.strip(), amt, body.vendor.strip(), body.receipt_name.strip(), "pending", timestamp, timestamp))
    _audit(user["email"], "REQUEST_SUBMITTED", f"{body.kind}: {body.title} ({amt} | {body.vendor})")
    return db.sql("SELECT id,kind,title,description,amount,vendor,receipt_name,status,created,updated,review_note FROM employee_requests WHERE id=?", (rid,), fetch=True)[0]


@router.get("/employee/resources")
def employee_resources(user=Depends(require_user)):
    can_access(user, "resources")
    return db.sql("SELECT id,title,description,url,audience FROM resources WHERE audience='all' OR audience=? ORDER BY title", (user["role"],), fetch=True)


@router.get("/admin/overview")
def admin_overview(days: int = Query(default=7, ge=7, le=90), user=Depends(require_admin)):
    total = db.sql("SELECT COUNT(*) n FROM users", fetch=True)[0]["n"]
    active = db.sql("SELECT COUNT(*) n FROM users WHERE active=1", fetch=True)[0]["n"]
    pending = db.sql("SELECT COUNT(*) n FROM employee_requests WHERE status='pending'", fetch=True)[0]["n"]
    role_counts = db.sql("SELECT role,COUNT(*) n FROM users GROUP BY role", fetch=True)
    recent = db.sql("SELECT ts,actor,decision,detail FROM audit ORDER BY id DESC LIMIT 8", fetch=True)
    events = db.sql("SELECT substr(ts,1,10) day, COUNT(*) count FROM audit WHERE ts >= ? GROUP BY substr(ts,1,10) ORDER BY day DESC LIMIT ?", ((datetime.utcnow()-timedelta(days=days-1)).strftime("%Y-%m-%d"), days), fetch=True)
    return {"total_users": total, "active_users": active, "pending_requests": pending, "role_counts": role_counts, "recent_activity": recent, "daily_activity": list(reversed(events))}


@router.get("/admin/users")
def users(user=Depends(require_admin)):
    return db.sql("SELECT id,email,name,role,active,department,created FROM users ORDER BY created", fetch=True)


@router.post("/admin/users")
def create_user(body: NewUser, user=Depends(require_admin)):
    if db.sql("SELECT id FROM users WHERE lower(email)=?", (body.email.lower(),), fetch=True):
        raise HTTPException(409, "An account with this email already exists.")
    uid = str(uuid.uuid4())
    db.sql("INSERT INTO users(id,email,name,role,password_hash,active,department,created) VALUES (?,?,?,?,?,?,?,?)",
           (uid, body.email.lower(), body.name.strip(), body.role, hasher.hash(body.password), 1, body.department.strip(), _now()))
    _audit(user["email"], "USER_CREATED", f"{body.role} account created: {body.email.lower()}")
    return {"id": uid, "email": body.email.lower(), "name": body.name.strip(), "role": body.role, "active": 1, "department": body.department.strip()}


@router.patch("/admin/users/{user_id}")
def update_user(user_id: str, body: dict, user=Depends(require_admin)):
    rows = db.sql("SELECT * FROM users WHERE id=?", (user_id,), fetch=True)
    if not rows: raise HTTPException(404, "Account not found.")
    target = rows[0]
    if target["id"] == user["id"] and body.get("active") is False:
        raise HTTPException(400, "You cannot deactivate your own admin account.")
    role = body.get("role", target["role"])
    active = int(body.get("active", target["active"]))
    if role not in ("admin", "employee"): raise HTTPException(400, "Role must be admin or employee.")
    if target["role"] == "admin" and (role != "admin" or not active):
        admins = db.sql("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1", fetch=True)[0]["n"]
        if admins <= 1: raise HTTPException(400, "Keep at least one active administrator.")
    db.sql("UPDATE users SET role=?,active=? WHERE id=?", (role, active, user_id))
    if not active: db.sql("DELETE FROM sessions WHERE user_id=?", (user_id,))
    _audit(user["email"], "USER_UPDATED", f"Account {target['email']}: role={role}, active={bool(active)}")
    return {"ok": True}


@router.delete("/admin/users/{user_id}")
def delete_user(user_id: str, user=Depends(require_admin)):
    rows = db.sql("SELECT * FROM users WHERE id=?", (user_id,), fetch=True)
    if not rows: raise HTTPException(404, "Account not found.")
    target = rows[0]
    if target["id"] == user["id"]: raise HTTPException(400, "You cannot delete your own account.")
    if target["role"] == "admin" and db.sql("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1", fetch=True)[0]["n"] <= 1:
        raise HTTPException(400, "Keep at least one active administrator.")
    db.sql("DELETE FROM employee_requests WHERE user_id=?", (user_id,))
    db.sql("DELETE FROM sessions WHERE user_id=?", (user_id,))
    db.sql("DELETE FROM users WHERE id=?", (user_id,))
    _audit(user["email"], "USER_DELETED", f"Deleted account {target['email']}")
    return {"ok": True}


@router.get("/admin/requests")
def all_requests(user=Depends(require_admin)):
    return db.sql("SELECT r.*,u.name employee_name,u.email employee_email FROM employee_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created DESC", fetch=True)


@router.patch("/admin/requests/{request_id}")
def review_request(request_id: str, body: RequestReview, user=Depends(require_admin)):
    rows = db.sql("SELECT id FROM employee_requests WHERE id=?", (request_id,), fetch=True)
    if not rows: raise HTTPException(404, "Request not found.")
    db.sql("UPDATE employee_requests SET status=?,updated=?,reviewer=?,review_note=? WHERE id=?",
           (body.status, _now(), user["email"], body.note.strip(), request_id))
    _audit(user["email"], "REQUEST_REVIEWED", f"{request_id}: {body.status}")
    return {"ok": True}


@router.get("/admin/resources")
def admin_resources(user=Depends(require_admin)):
    return db.sql("SELECT * FROM resources ORDER BY title", fetch=True)


@router.post("/admin/resources")
def add_resource(body: ResourceCreate, user=Depends(require_admin)):
    if body.url and not body.url.lower().startswith(("https://", "http://", "mailto:")):
        raise HTTPException(400, "Resource links must use HTTPS, HTTP, or mailto.")
    rid = str(uuid.uuid4())
    db.sql("INSERT INTO resources(id,title,description,url,audience,created) VALUES (?,?,?,?,?,?)",
           (rid, body.title.strip(), body.description.strip(), body.url.strip(), body.audience, _now()))
    _audit(user["email"], "RESOURCE_CREATED", body.title)
    return {"id": rid, "title": body.title, "description": body.description, "url": body.url, "audience": body.audience}


@router.delete("/admin/resources/{resource_id}")
def delete_resource(resource_id: str, user=Depends(require_admin)):
    rows = db.sql("SELECT title FROM resources WHERE id=?", (resource_id,), fetch=True)
    if not rows: raise HTTPException(404, "Resource not found.")
    db.sql("DELETE FROM resources WHERE id=?", (resource_id,))
    _audit(user["email"], "RESOURCE_DELETED", rows[0]["title"])
    return {"ok": True}


@router.get("/admin/access")
def access_matrix(user=Depends(require_admin)):
    return db.sql("SELECT role,feature,enabled FROM access_controls ORDER BY role,feature", fetch=True)


@router.put("/admin/access")
def update_access(body: dict, user=Depends(require_admin)):
    role, feature, enabled = body.get("role"), body.get("feature"), body.get("enabled")
    if role not in ("admin", "employee") or feature not in FEATURES or not isinstance(enabled, bool):
        raise HTTPException(400, "Select a valid role, feature, and access setting.")
    if role == "admin" and not enabled: raise HTTPException(400, "Administrator controls cannot be disabled from this screen.")
    if role == "employee" and feature not in EMPLOYEE_FEATURES:
        raise HTTPException(400, "This capability is reserved for administrators and is not available in the employee workspace.")
    db.sql("INSERT INTO access_controls(role,feature,enabled) VALUES (?,?,?) ON CONFLICT(role,feature) DO UPDATE SET enabled=excluded.enabled", (role, feature, int(enabled)))
    _audit(user["email"], "ACCESS_UPDATED", f"{role} access to {feature} set to {enabled}")
    return {"ok": True}


@router.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(user_id: str, body: dict, user=Depends(require_admin)):
    password = body.get("password", "")
    if len(password) < 12 or len(password) > 256: raise HTTPException(400, "Temporary password must be 12–256 characters.")
    rows = db.sql("SELECT email FROM users WHERE id=?", (user_id,), fetch=True)
    if not rows: raise HTTPException(404, "Account not found.")
    db.sql("UPDATE users SET password_hash=? WHERE id=?", (hasher.hash(password), user_id))
    db.sql("DELETE FROM sessions WHERE user_id=?", (user_id,))
    _audit(user["email"], "PASSWORD_RESET", f"Admin reset password for {rows[0]['email']}")
    return {"ok": True}


@router.post("/admin/users/{user_id}/reset-mfa")
def admin_reset_mfa(user_id: str, user=Depends(require_admin)):
    target = db.sql("SELECT email,role FROM users WHERE id=?", (user_id,), fetch=True)
    if not target: raise HTTPException(404, "Account not found.")
    if target[0]["role"] != "admin": raise HTTPException(400, "Authenticator verification is only required for administrators.")
    db.sql("UPDATE user_mfa SET secret='',pending_secret='',enabled=0 WHERE user_id=?", (user_id,))
    db.sql("DELETE FROM sessions WHERE user_id=?", (user_id,))
    _audit(user["email"], "MFA_RESET", f"Reset authenticator enrollment for {target[0]['email']}")
    return {"ok": True}


# ==========================================
# ENTERPRISE FEATURES: VENDORS, POs, WEBHOOKS
# ==========================================

class VendorModel(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    tax_id: str = Field(default="", max_length=50)
    bank_account: str = Field(default="", max_length=50)
    routing_number: str = Field(default="", max_length=50)
    iban: str = Field(default="", max_length=50)
    category: str = Field(default="", max_length=50)
    verified: bool = True
    notes: str = Field(default="", max_length=500)


@router.get("/admin/vendors")
def list_vendors(user=Depends(require_admin)):
    return db.sql("SELECT * FROM vendors ORDER BY verified DESC, name ASC", fetch=True) or []


@router.post("/admin/vendors")
def create_vendor(body: VendorModel, user=Depends(require_admin)):
    vid = f"vnd-{uuid.uuid4().hex[:8]}"
    existing = db.sql("SELECT id FROM vendors WHERE LOWER(name)=?", (body.name.strip().lower(),), fetch=True)
    if existing:
        raise HTTPException(400, f"A vendor with the name '{body.name}' already exists.")
    db.sql("INSERT INTO vendors(id,name,tax_id,bank_account,routing_number,iban,category,verified,notes,updated) VALUES (?,?,?,?,?,?,?,?,?,?)",
           (vid, body.name.strip(), body.tax_id.strip(), body.bank_account.strip(), body.routing_number.strip(), body.iban.strip(), body.category.strip(), int(body.verified), body.notes.strip(), _now()))
    _audit(user["email"], "VENDOR_CREATED", f"{body.name} (Tax ID: {body.tax_id})")
    return {"id": vid, "name": body.name, "verified": body.verified}


@router.put("/admin/vendors/{vendor_id}")
def update_vendor(vendor_id: str, body: VendorModel, user=Depends(require_admin)):
    row = db.sql("SELECT id, name FROM vendors WHERE id=?", (vendor_id,), fetch=True)
    if not row: raise HTTPException(404, "Vendor not found.")
    db.sql("UPDATE vendors SET name=?,tax_id=?,bank_account=?,routing_number=?,iban=?,category=?,verified=?,notes=?,updated=? WHERE id=?",
           (body.name.strip(), body.tax_id.strip(), body.bank_account.strip(), body.routing_number.strip(), body.iban.strip(), body.category.strip(), int(body.verified), body.notes.strip(), _now(), vendor_id))
    _audit(user["email"], "VENDOR_UPDATED", f"Updated vendor {body.name}")
    return {"ok": True}


@router.delete("/admin/vendors/{vendor_id}")
def delete_vendor(vendor_id: str, user=Depends(require_admin)):
    row = db.sql("SELECT id, name FROM vendors WHERE id=?", (vendor_id,), fetch=True)
    if not row: raise HTTPException(404, "Vendor not found.")
    db.sql("DELETE FROM vendors WHERE id=?", (vendor_id,))
    _audit(user["email"], "VENDOR_DELETED", f"Deleted vendor {row[0]['name']}")
    return {"ok": True}


class POModel(BaseModel):
    po_number: str = Field(min_length=3, max_length=50)
    vendor: str = Field(min_length=2, max_length=150)
    line_items: str = Field(default="", max_length=500)
    total_amount: float = Field(gt=0)
    status: str = Field(default="open")


@router.get("/admin/pos")
def list_pos(user=Depends(require_admin)):
    return db.sql("SELECT * FROM purchase_orders ORDER BY created DESC", fetch=True) or []


@router.post("/admin/pos")
def create_po(body: POModel, user=Depends(require_admin)):
    po_num = body.po_number.strip().upper()
    existing = db.sql("SELECT po_number FROM purchase_orders WHERE po_number=?", (po_num,), fetch=True)
    if existing: raise HTTPException(400, f"Purchase order '{po_num}' already exists.")
    db.sql("INSERT INTO purchase_orders(po_number,vendor,line_items,total_amount,status,created) VALUES (?,?,?,?,?,?)",
           (po_num, body.vendor.strip(), body.line_items.strip(), round(body.total_amount, 2), body.status.lower(), _now()[:10]))
    _audit(user["email"], "PO_CREATED", f"{po_num} for {body.vendor} (${body.total_amount:,.2f})")
    return {"ok": True, "po_number": po_num}


@router.put("/admin/pos/{po_number}")
def update_po(po_number: str, body: POModel, user=Depends(require_admin)):
    row = db.sql("SELECT po_number FROM purchase_orders WHERE po_number=?", (po_number.upper(),), fetch=True)
    if not row: raise HTTPException(404, "PO not found.")
    db.sql("UPDATE purchase_orders SET vendor=?,line_items=?,total_amount=?,status=? WHERE po_number=?",
           (body.vendor.strip(), body.line_items.strip(), round(body.total_amount, 2), body.status.lower(), po_number.upper()))
    _audit(user["email"], "PO_UPDATED", f"Updated {po_number}")
    return {"ok": True}


@router.delete("/admin/pos/{po_number}")
def delete_po(po_number: str, user=Depends(require_admin)):
    db.sql("DELETE FROM purchase_orders WHERE po_number=?", (po_number.upper(),))
    _audit(user["email"], "PO_DELETED", f"Deleted PO {po_number}")
    return {"ok": True}


class WebhookModel(BaseModel):
    url: str = Field(min_length=10, max_length=500)
    events: str = Field(default="ALL_FLAGS")
    secret: str = Field(default="", max_length=100)
    enabled: bool = True


@router.get("/admin/webhooks")
def list_webhooks(user=Depends(require_admin)):
    hooks = db.sql("SELECT * FROM webhooks ORDER BY created DESC", fetch=True) or []
    logs = db.sql("SELECT * FROM webhook_logs ORDER BY created DESC LIMIT 20", fetch=True) or []
    return {"webhooks": hooks, "logs": logs}


@router.post("/admin/webhooks")
def create_webhook(body: WebhookModel, user=Depends(require_admin)):
    if not body.url.lower().startswith(("https://", "http://")):
        raise HTTPException(400, "Webhook endpoint must start with https:// or http://")
    hid = f"whk-{uuid.uuid4().hex[:8]}"
    db.sql("INSERT INTO webhooks(id,url,secret,events,enabled,created) VALUES (?,?,?,?,?,?)",
           (hid, body.url.strip(), body.secret.strip(), body.events.strip(), int(body.enabled), _now()))
    _audit(user["email"], "WEBHOOK_CREATED", f"Webhook created: {body.url[:40]}")
    return {"id": hid, "url": body.url}


@router.delete("/admin/webhooks/{webhook_id}")
def delete_webhook(webhook_id: str, user=Depends(require_admin)):
    db.sql("DELETE FROM webhooks WHERE id=?", (webhook_id,))
    _audit(user["email"], "WEBHOOK_DELETED", f"Deleted webhook {webhook_id}")
    return {"ok": True}


@router.post("/admin/webhooks/{webhook_id}/test")
def test_webhook(webhook_id: str, user=Depends(require_admin)):
    row = db.sql("SELECT * FROM webhooks WHERE id=?", (webhook_id,), fetch=True)
    if not row: raise HTTPException(404, "Webhook not found.")
    import urllib.request
    hook = row[0]
    payload = json.dumps({
        "event": "VERIFI_TEST_EVENT",
        "timestamp": _now(),
        "summary": "Veri-Fi Webhook Test Ping from workspace administrator.",
        "details": {"system": "Veri-Fi Invoice Guardian", "actor": user["email"]}
    }).encode("utf-8")
    status = 200
    resp_text = "Delivered successfully"
    try:
        req = urllib.request.Request(hook["url"], data=payload, headers={"Content-Type": "application/json", "User-Agent": "VeriFi-Guardian/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.status
            resp_text = resp.read()[:200].decode("utf-8", errors="ignore")
    except Exception as e:
        status = 500
        resp_text = f"Connection failed: {str(e)[:150]}"

    log_id = f"wlog-{uuid.uuid4().hex[:8]}"
    db.sql("INSERT INTO webhook_logs(id,webhook_id,event,status_code,response,created) VALUES (?,?,?,?,?,?)",
           (log_id, webhook_id, "TEST_PING", status, resp_text, _now()))
    return {"status_code": status, "response": resp_text}

