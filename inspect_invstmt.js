const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run(){
  try{
    const pool = await sql.connect(config);
    const r = await pool.request().query(`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%statement%' OR TABLE_NAME LIKE '%stmt%' OR TABLE_NAME LIKE '%inventory%' OR TABLE_NAME LIKE '%stock%'
         OR TABLE_NAME LIKE '%valuation%' OR TABLE_NAME LIKE '%closing%' OR TABLE_NAME LIKE '%balance%' OR TABLE_NAME LIKE '%onhand%'
         OR TABLE_NAME LIKE '%rpt%' OR TABLE_NAME LIKE '%report%' OR TABLE_NAME LIKE '%vw%' OR TABLE_NAME LIKE '%inv%'
      ORDER BY TABLE_SCHEMA, TABLE_NAME`);
    console.log('Candidate tables/views:');
    r.recordset.forEach(t=>console.log('  '+t.TABLE_SCHEMA+'.'+t.TABLE_NAME+'  ['+t.TABLE_TYPE+']'));
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
