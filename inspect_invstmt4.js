const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const mssql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run(){
  try{
    const pool = await mssql.connect(config);
    const cols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM DataMart.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='inv' AND TABLE_NAME='tblInventoryStatement' ORDER BY ORDINAL_POSITION");
    console.log('DataMart.inv.tblInventoryStatement COLUMNS:');
    cols.recordset.forEach(c=>console.log('  '+c.COLUMN_NAME+' ('+c.DATA_TYPE+')'));
    const sample = await pool.request().query("SELECT TOP 2 * FROM DataMart.inv.tblInventoryStatement");
    console.log('\nSAMPLE ROW:');
    const r0 = sample.recordset[0];
    Object.keys(r0||{}).forEach(k=>console.log('  '+k+' = '+JSON.stringify(r0[k])));
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
