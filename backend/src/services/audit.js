const { executeNonQuery } = require('../config/db');

const SENSITIVE_KEY = /(password|passwd|otp|token|aadhar|aadhaar|secret)/i;

function getClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first.slice(0, 64);
  }
  return String(req.ip || (req.socket && req.socket.remoteAddress) || '').slice(0, 64) || null;
}

function maskValue(value) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return '[binary]';
  const str = String(value);
  if (str.length <= 4) return '****';
  return `${str.slice(0, 2)}****${str.slice(-2)}`;
}

function sanitize(value, key = '', depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[depth-limit]';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '[binary]';
  if (SENSITIVE_KEY.test(key)) return maskValue(value);
  if (Array.isArray(value)) return value.map((v) => sanitize(v, key, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitize(v, k, depth + 1);
    }
    return out;
  }
  return value;
}

function toJson(value) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(sanitize(value));
  } catch {
    return JSON.stringify({ note: 'value could not be serialised' });
  }
}

function plain(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '[binary]';
  return value;
}

/**
 * Compare two database rows and return only the columns that changed.
 * Used by the complaint edit / scrutiny routes so the audit trail records
 * exactly what was modified (old -> new) instead of a full row dump.
 */
function diffRows(before, after, exclude = []) {
  const skip = new Set(exclude.map((x) => String(x).toLowerCase()));
  const oldValues = {};
  const newValues = {};
  const changed = [];
  const a = before || {};
  const b = after || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (skip.has(String(key).toLowerCase())) continue;
    const av = plain(a[key]);
    const bv = plain(b[key]);
    let same;
    try {
      same = JSON.stringify(av) === JSON.stringify(bv);
    } catch {
      same = av === bv;
    }
    if (!same) {
      oldValues[key] = av;
      newValues[key] = bv;
      changed.push(key);
    }
  }
  return { oldValues, newValues, changed };
}

/**
 * Best-effort audit insert. A failure to write the trail is logged but never
 * breaks the business operation that produced it.
 */
async function writeAudit(req, entry = {}) {
  try {
    const user = (req && req.user) || {};
    const userId = entry.userId !== undefined ? entry.userId : user.UserID;
    const userType = entry.userType !== undefined ? entry.userType : user.UserType;
    const ip = entry.ipAddress !== undefined ? entry.ipAddress : getClientIp(req);
    const ua = String(
      entry.userAgent !== undefined
        ? entry.userAgent
        : (req && req.headers && req.headers['user-agent']) || ''
    ).slice(0, 500);
    await executeNonQuery(
      `INSERT INTO tbl_AuditTrail
         (CompID, CompNo, UserID, UserType, Action, Entity, EntityID,
          OldValues, NewValues, Details, IPAddress, UserAgent)
       VALUES (@compId, @compNo, @userId, @userType, @action, @entity, @entityId,
               @oldValues, @newValues, @details, @ipAddress, @userAgent)`,
      {
        compId: entry.compId != null ? Number(entry.compId) : null,
        compNo: entry.compNo || null,
        userId: userId != null ? Number(userId) : null,
        userType: userType != null ? Number(userType) : null,
        action: String(entry.action || 'COMPLAINT_UPDATE').slice(0, 100),
        entity: entry.entity ? String(entry.entity).slice(0, 80) : null,
        entityId: entry.entityId != null ? String(entry.entityId).slice(0, 80) : null,
        oldValues: toJson(entry.oldValues),
        newValues: toJson(entry.newValues),
        details: entry.details ? String(entry.details).slice(0, 4000) : null,
        ipAddress: ip,
        userAgent: ua || null,
      }
    );
  } catch (e) {
    console.error('audit trail write failed:', e.message);
  }
}

module.exports = { getClientIp, writeAudit, diffRows, sanitize };
