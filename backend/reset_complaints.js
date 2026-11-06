require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('./src/config/db');

const DOC_ROOT = path.join(__dirname, '..', 'Documents');
const BACKUP_ROOT = path.join(__dirname, 'backups');

const CHILD_TABLES = [
  ['ComplaintRemarksHistory', 'ComplaintID'],
  ['tbl_AdditionalStatusWithTime', 'CompID'],
  ['tbl_AdjournmentAttachment', 'CompID'],
  ['tbl_AdjournmentResponse', 'CompID'],
  ['tbl_Ajenda', 'CompID'],
  ['tbl_AnswerableMember', 'CompID'],
  ['tbl_AudioVideoAttachment', 'ComplaintID'],
  ['tbl_AuditTrail', 'CompID'],
  ['tbl_BenchAttendance', 'CompID'],
  ['tbl_CauseList', 'CompID'],
  ['tbl_CauseList_1', 'CompID'],
  ['tbl_ComplaintDocument', 'CompID'],
  ['tbl_ComplaintStatus', 'CompaintID'],
  ['tbl_ComplaintStatusAttachment', 'ComplaintID'],
  ['tbl_ComplaintSubStatus', 'CompID'],
  ['tbl_FactPersons', 'CompID'],
  ['tbl_Finding', 'CompID'],
  ['tbl_HearingAttendees', 'CompID'],
  ['tbl_MeetingDetails', 'CompID'],
  ['tbl_OnlinePayment', 'CompID'],
  ['tbl_ScheduleList', 'CompID'],
  ['tbl_SimilarCase', 'CompID'],
  ['tbl_SimilarCases', 'CompID'],
  ['tbl_StayDetails', 'CompID'],
  ['tbl_Witness', 'CompID'],
];

const SUBMITTED_IDS = `SELECT CompID FROM tbl_NewComplaint WHERE ISNULL(IsTemp, 0) = 0`;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const apply = process.argv.includes('--yes');
  const complaints = await query(
    `SELECT * FROM tbl_NewComplaint WHERE ISNULL(IsTemp, 0) = 0 ORDER BY CompID`
  );

  if (!complaints.length) {
    console.log('No submitted complaints found. Nothing to delete.');
    return;
  }

  console.log(`Submitted complaints: ${complaints.length} (CompID ${complaints[0].CompID} - ${complaints[complaints.length - 1].CompID})`);
  console.log('IDs:', complaints.map((c) => c.CompID).join(', '));

  if (!apply) {
    console.log('\nDRY RUN. Re-run with --yes to back up and delete.');
    return;
  }

  const backupDir = path.join(BACKUP_ROOT, `complaints_${stamp()}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const backup = { takenAt: new Date().toISOString(), complaints, related: {} };
  for (const [table, column] of CHILD_TABLES) {
    backup.related[table] = await query(
      `SELECT * FROM [${table}] WHERE [${column}] IN (${SUBMITTED_IDS})`
    );
  }

  const backupFile = path.join(backupDir, 'database.json');
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`Database backup: ${backupFile}`);

  if (fs.existsSync(DOC_ROOT)) {
    const docsBackup = path.join(backupDir, 'Documents');
    fs.cpSync(DOC_ROOT, docsBackup, { recursive: true, force: true });
    console.log(`Documents backup: ${docsBackup}`);
  }

  for (const [table, column] of CHILD_TABLES) {
    await query(`DELETE FROM [${table}] WHERE [${column}] IN (${SUBMITTED_IDS})`);
    console.log(`Deleted ${table}`);
  }

  await query(`DELETE FROM tbl_NewComplaint WHERE ISNULL(IsTemp, 0) = 0`);
  console.log('Deleted tbl_NewComplaint');

  if (fs.existsSync(DOC_ROOT)) {
    fs.rmSync(DOC_ROOT, { recursive: true, force: true });
    fs.mkdirSync(DOC_ROOT, { recursive: true });
    console.log('Cleared Documents folder');
  }

  const remaining = await query(
    `SELECT COUNT(*) AS cnt FROM tbl_NewComplaint WHERE ISNULL(IsTemp, 0) = 0`
  );
  console.log(`Remaining submitted complaints: ${remaining[0].cnt}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exit(1);
  });
