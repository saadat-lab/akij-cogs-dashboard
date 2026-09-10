const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run(){
  try{
    const pool = await sql.connect(config);
    const r = await pool.request().query(`SELECT ISNULL(h.strTransactionTypeName,'') AS t, COUNT(*) AS n,
        SUM(CASE WHEN r.numTransactionQuantity<0 THEN 1 ELSE 0 END) AS negQty,
        SUM(CASE WHEN r.numTransactionQuantity>0 THEN 1 ELSE 0 END) AS posQty
      FROM wms.tblInventoryTransactionRowArc r
      JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId=h.intInventoryTransactionId
      JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId=b.intBusinessUnitId
      WHERE h.TransactionGroupId=2 AND b.strBusinessUnitCode='AAFL' AND h.dteTransactionDate>='2026-03-01'
      GROUP BY h.strTransactionTypeName ORDER BY n DESC`);
    console.log('AAFL txn types (6mo):');
    r.recordset.forEach(x=>console.log('  '+x.t+' | n='+x.n+' | negQty='+x.negQty+' | posQty='+x.posQty));
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
