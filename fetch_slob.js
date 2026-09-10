const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const fs = require('fs');
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 600000 } };
const SBU_NAMES = { ACCL:'ACCL Akij Cement', AIL:'AIL Akij Ispat', AEL:'AEL Akij Essential', APFIL:'APFIL Akij Poly Fibre', ARMCL:'ARMCL', ABSL:'ABSL Akij Building Solutions', HRML:'HRML Hashem Rice', FAL:'FAL Fariq Agro', AAFL:'AAFL Akij Agro Feed', ALEL:'ALEL Akij Light Engineering' };
async function run() {
  try {
    const targetSet = new Set(Object.keys(SBU_NAMES));
    const pool = await sql.connect(config);
    const qry = `SELECT b.strBusinessUnitCode AS SBU, ISNULL(r.strItemName,'Unknown') AS ItemName, r.monTransactionValue AS value, r.numTransactionQuantity AS qty, ISNULL(h.strTransactionTypeName,'') AS txnType, h.dteTransactionDate AS dt
      FROM wms.tblInventoryTransactionRowArc r
      JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId
      JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId
      WHERE h.TransactionGroupId = 2 AND b.strBusinessUnitCode IN (${Object.keys(SBU_NAMES).map(s=>"'"+s+"'").join(',')}) AND h.dteTransactionDate >= '2026-07-01'`;
    const txnResult = await sql.query(qry);
    await pool.close();
    console.log('Total txn rows:', txnResult.recordset.length);

    const itemData = {};
    txnResult.recordset.forEach(r => {
      if (!targetSet.has(r.SBU)) return;
      const sbuKey = r.SBU; const itemKey = r.ItemName;
      if (!itemData[sbuKey]) itemData[sbuKey] = {};
      if (!itemData[sbuKey][itemKey]) itemData[sbuKey][itemKey] = { closing:0, inward:0, outward:0, shopFloorOut:0, txnTypes:new Set(), firstDt:null, lastDt:null };
      const it = itemData[sbuKey][itemKey];
      const v = r.value || 0; const q = r.qty || 0; const dt = r.dt ? r.dt.toISOString().split('T')[0] : null;
      it.closing += v;
      if (v > 0) it.inward += v; else it.outward += Math.abs(v);
      if (/shop\.floor/i.test(r.txnType || '')) it.shopFloorOut += Math.abs(v);
      if (r.txnType) it.txnTypes.add(r.txnType);
      if (dt) { if (!it.firstDt || dt < it.firstDt) it.firstDt = dt; if (!it.lastDt || dt > it.lastDt) it.lastDt = dt; }
    });

    const rows = [];
    for (const sbu of Object.keys(itemData)) {
      for (const [itemName, it] of Object.entries(itemData[sbu])) {
        const hasShopFloor = it.shopFloorOut > 0;
        const zeroCons = !hasShopFloor;
        const itemLower = itemName.toLowerCase();
        const isRM = /raw|cement|steel|coal|grain|pulse|feed|rice|flour|meal/.test(itemLower) || it.txnTypes.has('Issue For Shop Floor');
        const isPM = /pack|bag|carton|label|pouch|wrapper|sack|sticker|tin|can|cap|liner|bottle/.test(itemLower) || it.txnTypes.has('Issue For Shop Floor');
        const type = isRM ? 'RM' : (isPM ? 'PM' : 'Other');
        rows.push({ sbu, sbuName: SBU_NAMES[sbu]||sbu, item: itemName, type, closing: Math.round(it.closing), inward: Math.round(it.inward), outward: Math.round(it.outward), shopFloorCons: Math.round(it.shopFloorOut), zeroCons, firstDt: it.firstDt, lastDt: it.lastDt });
      }
    }
    fs.writeFileSync('C:\\Users\\saada\\OneDrive\\Documents\\Default Project\\slob_data.js', 'const SLOB_DATA = ' + JSON.stringify(rows) + ';');
    console.log('Saved slob_data.js with', rows.length, 'item rows');
  } catch (err) { console.error('Error:', err.message); }
}
run();
