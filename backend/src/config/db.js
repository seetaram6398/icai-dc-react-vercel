require('dotenv').config();

// ---------------------------------------------------------------------------
// Driver selection
//   msnodesqlv8 : native ODBC driver. Windows-only, supports Trusted_Connection.
//                 Used for local development against a SQL Server on this machine.
//   mssql       : pure-JS `mssql`/tedious driver using SQL auth over TCP.
//                 Required on Linux (Vercel serverless) where the ODBC native
//                 module and the ODBC Driver cannot be installed.
//
// The driver defaults to `mssql` when running on Vercel (VERCEL env var is set
// automatically) and to `msnodesqlv8` otherwise. Override with DB_DRIVER.
// ---------------------------------------------------------------------------
const server = process.env.DB_SERVER || 'DESKTOP-CRTSJHO\\SQLEXPRESS';
const database = process.env.DB_DATABASE || 'ICAI_COMPLAINT';
const trusted = process.env.DB_TRUSTED_CONNECTION === 'true';
const driver = (process.env.DB_DRIVER || (process.env.VERCEL ? 'mssql' : 'msnodesqlv8')).toLowerCase();

// ODBC connection string (msnodesqlv8) — only built for that driver.
const connStr = driver === 'msnodesqlv8'
  ? trusted
    ? `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;Encrypt=no`
    : `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};UID=${process.env.DB_USER};PWD=${process.env.DB_PASSWORD};TrustServerCertificate=yes;Encrypt=no`
  : null;

/**
 * Split a "host\instance" server string into its parts. tedious takes the host
 * and instance name as separate options.
 */
function parseServer(value) {
  const slash = value.indexOf('\\');
  if (slash === -1) return { host: value, instanceName: process.env.DB_INSTANCE || undefined };
  return { host: value.slice(0, slash), instanceName: value.slice(slash + 1) };
}

function buildMssqlConfig() {
  const { host, instanceName } = parseServer(server);
  const options = {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT !== 'false',
    enableArithAbort: true,
  };
  if (instanceName) options.instanceName = instanceName;
  return {
    server: host,
    database,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
    options,
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
}

/**
 * Convert named-parameter SQL (@name) to positional (?)
 * and return an ordered params array. Used by the msnodesqlv8 driver.
 * @param {string} sqlText SQL with @name placeholders
 * @param {Object} params { name: value }
 * @returns {{ sql: string, params: any[] }}
 */
function toPositional(sqlText, params) {
  if (!params || Object.keys(params).length === 0) {
    return { sql: sqlText, params: [] };
  }
  const ordered = [];
  const sql = sqlText.replace(/@([A-Za-z0-9_]+)/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      ordered.push(params[name]);
      return '?';
    }
    return match; // leave unknown macros alone
  });
  return { sql, params: ordered };
}

// --------------------------- msnodesqlv8 implementation ---------------------
// The module name is held in a variable so Vercel's file tracer does not try to
// bundle this Windows-only native module into the Linux serverless function.
const ODBC_MODULE = 'msnodesqlv8';
let odbc = null;
function getOdbc() {
  if (!odbc) odbc = require(ODBC_MODULE);
  return odbc;
}

function odbcQuery(sqlText, arr) {
  return new Promise((resolve, reject) => {
    getOdbc().query(connStr, sqlText, arr, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ------------------------------ mssql implementation ------------------------
let poolPromise = null;
function getPool() {
  if (!poolPromise) {
    const mssql = require('mssql');
    poolPromise = new mssql.ConnectionPool(buildMssqlConfig()).connect();
  }
  return poolPromise;
}

async function mssqlQuery(sqlText, params) {
  const mssql = require('mssql');
  const pool = await getPool();
  const request = pool.request();

  // Register only the params that actually appear as @name tokens in the SQL.
  const names = new Set();
  sqlText.replace(/@([A-Za-z0-9_]+)/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) names.add(name);
    return match;
  });
  for (const name of names) {
    const value = params[name];
    // tedious needs an explicit type for NULL parameters.
    if (value === null || value === undefined) request.input(name, mssql.NVarChar, null);
    else request.input(name, value);
  }

  const result = await request.query(sqlText);
  return result.recordset || [];
}

// ---------------------------------- public API ------------------------------
async function query(sqlText, params = {}) {
  if (driver === 'mssql') return mssqlQuery(sqlText, params);
  const { sql: prepared, params: arr } = toPositional(sqlText, params);
  return odbcQuery(prepared, arr);
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
  if (driver === 'mssql') {
    await mssqlQuery(sqlText, params);
    return Object.keys(params).length;
  }
  const { sql: prepared, params: arr } = toPositional(sqlText, params);
  await odbcQuery(prepared, arr);
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
