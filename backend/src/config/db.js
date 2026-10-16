require('dotenv').config();
const sql = require('msnodesqlv8');

// Build ODBC connection string with Windows integrated auth
const server = process.env.DB_SERVER || 'DESKTOP-CRTSJHO\\SQLEXPRESS';
const database = process.env.DB_DATABASE || 'ICAI_COMPLAINT';
const trusted = process.env.DB_TRUSTED_CONNECTION === 'true';

let connStr;
if (trusted) {
  connStr =
    `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;Encrypt=no`;
} else {
  connStr =
    `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};UID=${process.env.DB_USER};PWD=${process.env.DB_PASSWORD};TrustServerCertificate=yes;Encrypt=no`;
}

/**
 * Convert named-parameter SQL (@name) to positional (?)
 * and return an ordered params array.
 * @param {string} sqlText SQL with @name placeholders
 * @param {Object} params { name: value }
 * @returns {{ sql: string, params: any[] }}
 */
function toPositional(sqlText, params) {
  if (!params || Object.keys(params).length === 0) {
    return { sql: sqlText, params: [] };
  }
  const ordered = [];
  let sql = sqlText.replace(/@([A-Za-z0-9_]+)/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      ordered.push(params[name]);
      return '?';
    }
    return match; // leave unknown macros alone
  });
  return { sql, params: ordered };
}

function queryAsync(connString, sqlText, sqlParams) {
  return new Promise((resolve, reject) => {
    sql.query(connString, sqlText, sqlParams, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Execute a SELECT with named parameters (@name -> positional ?).
 */
async function query(sqlText, params = {}) {
  const { sql: prepared, params: arr } = toPositional(sqlText, params);
  return queryAsync(connStr, prepared, arr);
}

async function executeScalar(sqlText, params = {}) {
  const rows = await query(sqlText, params);
  if (rows && rows.length > 0) {
    const first = rows[0];
    const keys = Object.keys(first);
    return keys.length ? first[keys[0]] : null;
  }
  return null;
}

async function executeNonQuery(sqlText, params = {}) {
  const { sql: prepared, params: arr } = toPositional(sqlText, params);
  await queryAsync(connStr, prepared, arr);
  return arr.length;
}

async function executeReader(sqlText, params = {}) {
  return query(sqlText, params);
}

async function checkConnection() {
  await query('SELECT 1 AS ok');
  return true;
}

module.exports = {
  query,
  executeScalar,
  executeNonQuery,
  executeReader,
  checkConnection,
  getConnectionString: () => connStr,
};