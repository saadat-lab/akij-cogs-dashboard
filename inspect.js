const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run() {
  const pool = await sql.connect(config);
  const r1 = await pool.request().query("SELECT TOP 20 strBusinessUnitCode AS SBU, strBusinessUnitName AS SBUName FROM dco.tblbusinessunitArc ORDER BY strBusinessUnitCode");
  console.log('SAMPLE SBUs:'); r1.recordset.forEach(r => console.log('  ', JSON.stringify(r.SBU), r.SBUName));
  const r2 = await pool.request().query("SELECT TOP 5 r.intItemId, ISNULL(r.strItemName,'NULL') AS ItemName, h.strTransactionTypeName AS txnType, b.strBusinessUnitCode AS SBU FROM wms.tblInventoryTransactionRowArc r JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId=h.intInventoryTransactionId JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId=b.intBusinessUnitId WHERE h.TransactionGroupId=2");
  console.log('SAMPLE TXNS:'); r2.recordset.forEach(r => console.log('  ', JSON.stringify(r)));
  await pool.close();
}
run();
