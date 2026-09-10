/*
 * COGS Dashboard Auto-Refresh Script
 * -----------------------------------
 * Runs daily to fetch latest COGS data from SQL Server and regenerate the dashboard.
 * 
 * Schedule via Windows Task Scheduler:
 *   Program: C:\Program Files\nodejs\node.exe
 *   Arguments: C:\Users\saada\OneDrive\Documents\Default Project\refresh_cogs.js
 *   Trigger: Daily at 7:00 AM
 */

const sql = require('C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  server: '203.202.241.211',
  port: 1433,
  user: 'mcp_user',
  password: 'iAOS@35o997',
  database: 'DWH',
  options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 60000 }
};

const SBU_IDS = [4, 224, 144, 8, 175, 220, 188, 189, 232, 237];
const GL_NAMES = ["Raw Materials", "Raw Materials in Transit", "Packaging Materials", "Packaging Materials in Transit", "Cost Of Goods Sold", "Cost of Goods Sold", "Accrued Cost of Goods Sold"];
const OUTPUT = path.join(__dirname, 'cogs_dashboard.html');

async function query(q) {
  const pool = await sql.connect(CONFIG);
  const result = await pool.request().query(q);
  await pool.close();
  return result.recordset;
}

function json(data) { return JSON.stringify(data).replace(/</g,'\\u003c'); }

async function main() {
  console.log(`[${new Date().toISOString()}] Refreshing COGS dashboard...`);

  // 1. SBU summary
  const summary = await query(`
    SELECT b.strBusinessUnitCode AS code, b.strBusinessUnitName AS name,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Cost Of Goods Sold','Cost of Goods Sold','Accrued Cost of Goods Sold') THEN j.numAmount ELSE 0 END) AS cogs,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit') AND j.numAmount < 0 THEN ABS(j.numAmount) ELSE 0 END) AS rmCons,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit') AND j.numAmount > 0 THEN j.numAmount ELSE 0 END) AS rmPurch,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Packaging Materials','Packaging Materials in Transit') AND j.numAmount < 0 THEN ABS(j.numAmount) ELSE 0 END) AS pmCons,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Packaging Materials','Packaging Materials in Transit') AND j.numAmount > 0 THEN j.numAmount ELSE 0 END) AS pmPurch
    FROM fin.tblAccountingJournalArc j
    JOIN dco.tblbusinessunitArc b ON j.intBusinessUnitId = b.intBusinessUnitId
    WHERE j.intBusinessUnitId IN (${SBU_IDS.join(',')}) AND j.dteTransactionDate >= '2026-07-01'
      AND j.strGeneralLedgerName IN (${GL_NAMES.map(n=>"'"+n+"'").join(',')})
    GROUP BY b.strBusinessUnitCode, b.strBusinessUnitName ORDER BY cogs DESC
  `);

  // 2. Monthly data
  const monthlyData = await query(`
    SELECT YEAR(dteTransactionDate) AS yr, MONTH(dteTransactionDate) AS mon,
      b.strBusinessUnitCode AS code,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Cost Of Goods Sold','Cost of Goods Sold','Accrued Cost of Goods Sold') THEN j.numAmount ELSE 0 END) AS cogs,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit') THEN j.numAmount ELSE 0 END) AS rmNet,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Packaging Materials','Packaging Materials in Transit') THEN j.numAmount ELSE 0 END) AS pmNet
    FROM fin.tblAccountingJournalArc j
    JOIN dco.tblbusinessunitArc b ON j.intBusinessUnitId = b.intBusinessUnitId
    WHERE j.intBusinessUnitId IN (${SBU_IDS.join(',')}) AND j.dteTransactionDate >= '2026-07-01'
      AND j.strGeneralLedgerName IN (${GL_NAMES.map(n=>"'"+n+"'").join(',')})
    GROUP BY YEAR(dteTransactionDate), MONTH(dteTransactionDate), b.strBusinessUnitCode
    ORDER BY yr, mon, code
  `);

  // 3. Daily data
  const dailyData = await query(`
    SELECT CONVERT(DATE, dteTransactionDate) AS dt,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Cost Of Goods Sold','Cost of Goods Sold','Accrued Cost of Goods Sold') THEN j.numAmount ELSE 0 END) AS cogs,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit') AND j.numAmount < 0 THEN ABS(j.numAmount) ELSE 0 END) AS rmCons,
      SUM(CASE WHEN j.strGeneralLedgerName IN ('Packaging Materials','Packaging Materials in Transit') AND j.numAmount < 0 THEN ABS(j.numAmount) ELSE 0 END) AS pmCons
    FROM fin.tblAccountingJournalArc j
    WHERE j.intBusinessUnitId IN (${SBU_IDS.join(',')}) AND j.dteTransactionDate >= '2026-07-01'
      AND j.strGeneralLedgerName IN (${GL_NAMES.map(n=>"'"+n+"'").join(',')})
    GROUP BY CONVERT(DATE, dteTransactionDate) ORDER BY dt
  `);

  // Build monthly map
  const monthly = {};
  monthlyData.forEach(r => {
    const key = r.yr + '-' + String(r.mon).padStart(2, '0');
    if (!monthly[key]) monthly[key] = {};
    monthly[key][r.code] = [r.cogs, r.rmNet, r.pmNet];
  });

  // Build daily array
  const daily = dailyData.map(r => [
    r.dt.toISOString().split('T')[0],
    Math.round(r.cogs / 1000000 * 10) / 10,
    Math.round(r.rmCons / 1000000 * 10) / 10,
    Math.round(r.pmCons / 1000000 * 10) / 10
  ]);

  // Inject into HTML template
  const template = fs.readFileSync(OUTPUT, 'utf-8');
  
  // Replace data block between DATA_START and DATA_END
  const dataBlock = `const rawData = ${json({summary, monthly, daily})};`;
  
  const updated = template.replace(
    /\/\/ ===== DATA \(From MSSQL[\s\S]*?const rawData = \{[\s\S]*?\};/,
    '// ===== DATA (From MSSQL - Last refreshed: ' + new Date().toISOString() + ') =====\n' + dataBlock
  );

  fs.writeFileSync(OUTPUT, updated);
  console.log(`[${new Date().toISOString()}] Dashboard refreshed! ${summary.length} SBUs, ${daily.length} trading days.`);
  process.exit(0);
}

main().catch(e => { console.error('Refresh failed:', e.message); process.exit(1); });
