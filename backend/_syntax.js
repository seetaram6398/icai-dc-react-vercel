require('dotenv').config();
const sql = require('msnodesqlv8');
const server = process.env.DB_SERVER || 'DESKTOP-CRTSJHO\\SQLEXPRESS';
const database = process.env.DB_DATABASE || 'ICAI_COMPLAINT';
const connStr = `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;Encrypt=no`;
function run(label, q) { return new Promise((res, rej) => sql.query(connStr, q, (e, rows) => { if (e) return rej(e); console.log('== ' + label + ' =='); console.log(JSON.stringify(rows, null, 1)); res(); })); }
(async () => {
  try {
    await run('user 62 full', `SELECT UserID, LoginID, Email, NameOfTheUser, MembershipNo, Mob, UserType, ASID, IsVerify, IsDeactivated, RegisterDate FROM tbl_Users WHERE UserID=62`);
    await run('loginid jazz', `SELECT UserID, LoginID, Email FROM tbl_Users WHERE LOWER(LTRIM(RTRIM(LoginID)))='jazzkr21@gmail.com'`);
    await run('email like jazz or vinay', `SELECT UserID, LoginID, Email FROM tbl_Users WHERE LOWER(LTRIM(RTRIM(Email))) LIKE '%jazzkr21%' OR LOWER(LTRIM(RTRIM(Email))) LIKE '%vinay@idiary%' OR LOWER(LTRIM(RTRIM(LoginID))) LIKE '%jazzkr21%'`);
    await run('respondent 210', `SELECT TOP 1 ResName, ResRegistrationNo, ResMobileNo, ResEmailID, IsTemp, IsFirm FROM tbl_NewComplaint WHERE CompID=210`);
    await run('indexes on tbl_Users', `SELECT i.name AS IndexName, i.is_unique, ic.column_id, c.name AS ColName, i.is_unique_constraint, i.is_primary_key FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id JOIN sys.columns c ON ic.object_id=c.object_id AND ic.column_id=c.column_id JOIN sys.tables t ON i.object_id=t.object_id WHERE t.name='tbl_Users'`);

    // check complaintant user by loginid
    await run('complainant kanak', `SELECT UserID, LoginID, Email, NameOfTheUser, MembershipNo, UserType, IsVerify FROM tbl_Users WHERE LOWER(LTRIM(RTRIM(LoginID))) LIKE '%kanak%' OR LOWER(LTRIM(RTRIM(Email))) LIKE '%kanak%'`);
  } catch (e) { console.error('ERR', e.message); }
})();