const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 600000 } };
async function run(){
  try{
    const pool = await sql.connect(config);
    const r1 = await pool.request().query(`SELECT COUNT(*) AS n, SUM(CASE WHEN r.monTransactionValue>0 THEN r.monTransactionValue ELSE 0 END) AS inward, SUM(CASE WHEN r.monTransactionValue<0 THEN -r.monTransactionValue ELSE 0 END) AS outward, MIN(r.monTransactionValue) AS minv, MAX(r.monTransactionValue) AS maxv, AVG(r.monTransactionValue) AS avgv FROM wms.tblInventoryTransactionRowArc r JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId=h.intInventoryTransactionId JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId=b.intBusinessUnitId WHERE h.TransactionGroupId=2 AND b.strBusinessUnitCode='HRML' AND h.dteTransactionDate>='2026-03-01' AND h.dteTransactionDate<='2026-08-31'`);
    console.log('AGG:', JSON.stringify(r1.recordset[0]));
    const r2 = await pool.request().query(`SELECT TOP 15 ISNULL(h.strTransactionTypeName,'') AS t, ISNULL(r.strItemName,'') AS item, r.monTransactionValue AS v FROM wms.tblInventoryTransactionRowArc r JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId=h.intInventoryTransactionId JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId=b.intBusinessUnitId WHERE h.TransactionGroupId=2 AND b.strBusinessUnitCode='HRML' AND h.dteTransactionDate>='2026-03-01' ORDER BY r.monTransactionValue DESC`);
    console.log('TOP VALUES:');
    r2.recordset.forEach(x=>console.log('  ',x.t,'|',x.item.substring(0,40),'|',x.v));
    const r3 = await pool.request().query(`SELECT ISNULL(h.strTransactionTypeName,'') AS t, COUNT(*) AS n FROM wms.tblInventoryTransactionRowArc r JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId=h.intInventoryTransactionId JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId=b.intBusinessUnitId WHERE h.TransactionGroupId=2 AND b.strBusinessUnitCode='HRML' AND h.dteTransactionDate>='2026-03-01' AND h.dteTransactionDate<='2026-08-31' GROUP BY h.strTransactionTypeName ORDER BY n DESC`);
    console.log('TXN TYPES:');
    r3.recordset.forEach(x=>console.log('  ',x.t,'|',x.n));
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
