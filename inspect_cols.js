const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run(){
  try{
    const pool = await sql.connect(config);
    const r = await pool.request().query("SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%closing%' OR COLUMN_NAME LIKE '%onhand%' OR COLUMN_NAME LIKE '%stock%val%' OR COLUMN_NAME LIKE '%balance%val%' OR COLUMN_NAME LIKE '%closing%val%' OR COLUMN_NAME LIKE '%closing%qty%' OR COLUMN_NAME LIKE '%valuation%' OR COLUMN_NAME LIKE '%cogs%' OR COLUMN_NAME LIKE '%stockledger%' OR (COLUMN_NAME LIKE '%balance%' AND TABLE_NAME LIKE '%inv%') ORDER BY TABLE_SCHEMA, TABLE_NAME");
    console.log('COLUMNS OF INTEREST:');
    r.recordset.forEach(c=>console.log('  '+c.TABLE_SCHEMA+'.'+c.TABLE_NAME+' . '+c.COLUMN_NAME));
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
