const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
async function run(){
  try{
    const pool = await sql.connect(config);
    const bu = await pool.request().query("SELECT intBusinessUnitId, strBusinessUnitCode FROM dco.tblbusinessunitArc WHERE strBusinessUnitCode IN ('AAFL','HRML')");
    const map = {}; bu.recordset.forEach(b=>map[b.strBusinessUnitCode]=b.intBusinessUnitId);
    for (const code of ['AAFL','HRML']) {
      const id = map[code];
      const q = `WITH latest AS (SELECT intItemId, MAX(dteLastActionDateTime) AS md FROM wms.tblItemPlantWarehouseArc WHERE intBusinessUnitId=${id} GROUP BY intItemId)
        SELECT COUNT(*) AS items, SUM(t.numCOGS) AS totalCogs, SUM(t.numCurrentStock) AS totalStock,
               SUM(CASE WHEN t.numCOGS>0 THEN 1 ELSE 0 END) AS itemsWithValue,
               SUM(CASE WHEN t.numCurrentStock<0 THEN 1 ELSE 0 END) AS itemsNegStock
        FROM wms.tblItemPlantWarehouseArc t JOIN latest l ON t.intItemId=l.intItemId AND t.dteLastActionDateTime=l.md
        WHERE t.intBusinessUnitId=${id}`;
      const agg = await pool.request().query(q);
      const a = agg.recordset[0];
      console.log(code+' (BU '+id+'): items='+a.items+' | sum(numCOGS)='+(a.totalCogs/1e7).toFixed(2)+' Cr (raw '+a.totalCogs+') | sum(currentStock)='+a.totalStock+' | itemsWithValue='+a.itemsWithValue+' | itemsNegStock='+a.itemsNegStock);
    }
    // sample a few AAFL rows with value
    const samp = await pool.request().query(`WITH latest AS (SELECT intItemId, MAX(dteLastActionDateTime) AS md FROM wms.tblItemPlantWarehouseArc WHERE intBusinessUnitId=232 GROUP BY intItemId)
      SELECT TOP 8 t.strItemName, t.numCurrentStock, t.numCOGS FROM wms.tblItemPlantWarehouseArc t JOIN latest l ON t.intItemId=l.intItemId AND t.dteLastActionDateTime=l.md WHERE t.intBusinessUnitId=232 AND t.numCOGS>0 ORDER BY t.numCOGS DESC`);
    console.log('\nAAFL top items by numCOGS:');
    samp.recordset.forEach(r=>console.log('  '+r.strItemName.substring(0,40)+' | stock='+r.numCurrentStock+' | cogs='+r.numCOGS+' ('+(r.numCOGS/1e7).toFixed(3)+' Cr)'));
    await pool.close();
  }catch(e){console.error('ERR',e.message);}
}
run();
