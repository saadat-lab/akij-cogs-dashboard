const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run(){
  try{
    const pool = await sql.connect(config);
    const cols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='wms' AND TABLE_NAME='tblItemPlantWarehouseArc' ORDER BY ORDINAL_POSITION");
    console.log('wms.tblItemPlantWarehouseArc COLUMNS:');
    cols.recordset.forEach(c=>console.log('  '+c.COLUMN_NAME+' ('+c.DATA_TYPE+')'));
    const sample = await pool.request().query("SELECT TOP 5 * FROM wms.tblItemPlantWarehouseArc");
    console.log('\nSAMPLE ROW (keys only):');
    const keys = Object.keys(sample.recordset[0]||{});
    keys.forEach(k=>console.log('  '+k+' = '+JSON.stringify(sample.recordset[0][k])));
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
