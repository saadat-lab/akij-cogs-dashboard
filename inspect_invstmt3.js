const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const mssql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 600000 } };
async function run(){
  try{
    const pool = await mssql.connect(config);
    const q = `SELECT r.strItemName AS item,
        SUM(r.monTransactionValue) AS netVal,
        SUM(CASE WHEN r.numTransactionQuantity < 0 AND h.dteTransactionDate >= '2026-03-01' THEN 1 ELSE 0 END) AS neg6,
        SUM(CASE WHEN h.dteTransactionDate >= '2026-03-01' THEN 1 ELSE 0 END) AS any6
      FROM wms.tblInventoryTransactionRowArc r
      JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId
      JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId
      WHERE b.strBusinessUnitCode = 'AAFL'
      GROUP BY r.strItemName`;
    const res = await pool.request().query(q);
    await pool.close();
    const rows = res.recordset;
    console.log('AAFL distinct items in ledger:', rows.length);
    let totalInv = 0, slobVal = 0, itemsWithVal=0, slobItems=0;
    rows.forEach(r => {
      const net = r.netVal || 0;
      if (net > 0) { totalInv += net; itemsWithVal++; if ((r.neg6||0) === 0) { slobVal += net; slobItems++; } }
    });
    console.log('AAFL Total Inventory Value (sum +net): '+(totalInv/1e7).toFixed(2)+' Cr');
    console.log('AAFL SLOB Value (zero neg6mo & +net):   '+(slobVal/1e7).toFixed(2)+' Cr  ('+(slobVal/totalInv*100).toFixed(2)+'% of total)');
    console.log('CSV says: Total 100.64 Cr | SLOB 1.09 Cr (1.08%)');
    console.log('Items with closing value>0: '+itemsWithVal+' | SLOB items: '+slobItems);
  }catch(e){console.error('ERR',e.message);}
}
run();
