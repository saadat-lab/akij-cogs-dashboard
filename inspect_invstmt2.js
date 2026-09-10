const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run(){
  try{
    const pool = await sql.connect(config);
    // 1. distinct WMS transaction types (all time) + sign of value
    const t = await pool.request().query(`SELECT h.strTransactionTypeName AS t, COUNT(*) AS n,
        SUM(CASE WHEN r.monTransactionValue<0 THEN 1 ELSE 0 END) AS neg,
        SUM(CASE WHEN r.monTransactionValue>0 THEN 1 ELSE 0 END) AS pos,
        SUM(CASE WHEN r.numTransactionQuantity<0 THEN 1 ELSE 0 END) AS negQ,
        SUM(CASE WHEN r.numTransactionQuantity>0 THEN 1 ELSE 0 END) AS posQ
      FROM wms.tblInventoryTransactionHeaderArc h
      JOIN wms.tblInventoryTransactionRowArc r ON r.intInventoryTransactionId=h.intInventoryTransactionId
      GROUP BY h.strTransactionTypeName ORDER BY n DESC`);
    console.log('ALL WMS transaction types:');
    t.recordset.forEach(x=>console.log('  '+x.t+' | n='+x.n+' | val neg/pos='+x.neg+'/'+x.pos+' | qty neg/pos='+x.negQ+'/'+x.posQ));
    // 2. other databases on server
    const dbs = await pool.request().query("SELECT name FROM sys.databases WHERE database_id>4 ORDER BY name");
    console.log('\nOther databases on server:');
    dbs.recordset.forEach(d=>console.log('  '+d.name));
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
