const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run(){
  try{
    const pool = await sql.connect(config);
    // BU ids
    const bu = await pool.request().query("SELECT intBusinessUnitId, strBusinessUnitCode, strBusinessUnitName FROM dco.tblbusinessunitArc WHERE strBusinessUnitCode IN ('AAFL','HRML')");
    const map = {}; bu.recordset.forEach(b=>map[b.strBusinessUnitCode]=b.intBusinessUnitId);
    console.log('BU ids:', JSON.stringify(map));
    // snapshot date distribution (overall + per BU)
    const dates = await pool.request().query("SELECT intBusinessUnitId, MAX(dteLastActionDateTime) AS maxdt, COUNT(*) AS n, COUNT(DISTINCT CONVERT(date,dteLastActionDateTime)) AS distinctDays FROM wms.tblItemPlantWarehouseArc GROUP BY intBusinessUnitId");
    console.log('Snapshot info per BU (intBusinessUnitId: maxDate, rows, distinctDays):');
    dates.recordset.forEach(d=>console.log('  BU '+d.intBusinessUnitId+': '+d.maxdt+' | rows='+d.n+' | days='+d.distinctDays));
    // For AAFL and HRML: sum numCOGS at latest snapshot date
    for (const code of ['AAFL','HRML']) {
      const id = map[code];
      const maxdt = await pool.request().query("SELECT MAX(dteLastActionDateTime) AS m FROM wms.tblItemPlantWarehouseArc WHERE intBusinessUnitId="+id);
      const md = maxdt.recordset[0].m;
      const agg = await pool.request().query("SELECT COUNT(*) AS items, SUM(numCOGS) AS totalCogs, SUM(numCurrentStock) AS totalStock, SUM(CASE WHEN numCOGS>0 THEN 1 ELSE 0 END) AS itemsWithValue FROM wms.tblItemPlantWarehouseArc WHERE intBusinessUnitId="+id+" AND dteLastActionDateTime='"+md+"'");
      const a = agg.recordset[0];
      console.log(code+' (BU '+id+', snap '+md+'): items='+a.items+' | sum(numCOGS)='+a.totalCogs+' ('+(a.totalCogs/1e7).toFixed(2)+' Cr) | sum(currentStock)='+a.totalStock+' | itemsWithValue='+a.itemsWithValue);
    }
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
