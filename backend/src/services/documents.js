const fs = require('fs');
const path = require('path');

const DOC_ROOT = path.join(__dirname, '..', '..', '..', 'Documents');

// basename -> resolved { rel, abs } cache. Invalidate on a miss so files added
// later (uploads run on the same process) are picked up.
const cache = new Map();

/**
 * Normalize a stored document reference into a Documents-relative path.
 * Handles the three shapes found in the DB:
 *   - "folder/file.pdf"                 (modern tbl_ComplaintDocument.DocURL)
 *   - "file.pdf"                        (tbl_ComplaintStatus.Attachment etc.)
 *   - "~/Documents/OtherCompDoc/x.pdf"  (legacy imports)
 */
function normalizeStoredPath(value) {
  if (value == null) return null;
  let p = String(value).replace(/\\/g, '/');
  p = p.replace(/^~\/?/i, '');
  p = p.replace(/^\/+/, '');
  p = p.replace(/^Documents\//i, '');
  if (p.startsWith('.')) p = p.replace(/^\.+\//, '');
  return p.trim() || null;
}

function walkFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

function findByBasename(basename) {
  if (cache.has(basename)) {
    const hit = cache.get(basename);
    if (hit && fs.existsSync(hit.abs)) return hit;
    cache.delete(basename);
  }
  const target = basename.toLowerCase();
  const files = walkFiles(DOC_ROOT);
  const found = files.find((f) => path.basename(f).toLowerCase() === target) || null;
  if (!found) return null;
  const rel = path.relative(DOC_ROOT, found).replace(/\\/g, '/');
  const hit = { rel, abs: found };
  cache.set(basename, hit);
  return hit;
}

/**
 * Resolve any stored document reference to a real file on disk.
 * @returns {{ rel: string, abs: string } | null}
 */
function resolveDocumentPath(value) {
  const rel = normalizeStoredPath(value);
  if (!rel) return null;
  const direct = path.join(DOC_ROOT, rel);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return { rel, abs: direct };
  }
  return findByBasename(path.basename(rel));
}

module.exports = { resolveDocumentPath, normalizeStoredPath, DOC_ROOT };