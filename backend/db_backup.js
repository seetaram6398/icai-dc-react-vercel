const { executeNonQuery } = require('./src/config/db');

(async () => {
  const path = 'D:\\Seetaram\\ICAI-DC-Automation\\dc-react-3105\\ICAI_COMPLAINT_20261010.bak';
  await executeNonQuery('BACKUP DATABASE [ICAI_COMPLAINT] TO DISK = @path WITH INIT, FORMAT, STATS = 10', { path });
  console.log('BACKUP OK ->', path);
})().catch((e) => {
  console.error('BACKUP FAILED:', e.message);
  process.exitCode = 1;
});