const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const mssql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
const candidates = ['ARDW','DataMart','akijair','iBOSDDD','ARL','ControlPanelApps'];
async function run(){
  try{
    const pool = await mssql.connect(config);
    for (const db of candidates){
      try{
        const r = await pool.request().query(`SELECT TABLE_SCHEMA, TABLE_NAME FROM ${db}.INFORMATION_SCHEMA.TABLES
          WHERE TABLE_NAME LIKE '%stock%' OR TABLE_NAME LIKE '%inventory%' OR TABLE_NAME LIKE '%closing%'
             OR TABLE_NAME LIKE '%valuation%' OR TABLE_NAME LIKE '%statement%' OR TABLE_NAME LIKE '%onhand%'
             OR TABLE_NAME LIKE '%inv%' OR TABLE_NAME LIKE '%stmt%' OR TABLE_NAME LIKE '%balance%'
          ORDER BY TABLE_SCHEMA, TABLE_NAME`);
        if (r.recordset.length){
          console.log('\n=== '+db+' ===');
          r.recordset.forEach(t=>console.log('  '+t.TABLE_SCHEMA+'.'+t.TABLE_NAME));
        } else {
          console.log(db+': no matching tables (or no access)');
        }
      }catch(e){ console.log(db+': ERROR '+e.message.split('\n')[0]); }
    }
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
