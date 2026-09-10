const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 } };
const SBU_NAMES = { ACCL:'ACCL Akij Cement', AIL:'AIL Akij Ispat', AEL:'AEL Akij Essential', APFIL:'APFIL Akij Poly Fibre', ARMCL:'ARMCL', ABSL:'ABSL Akij Building Solutions', HRML:'HRML Hashem Rice', FAL:'FAL Fariq Agro', AAFL:'AAFL Akij Agro Feed', ALEL:'ALEL Akij Light Engineering' };
async function run() {
  try {
    const sbuPool = await sql.connect(config);
    const sbuResult = await sbuPool.request().query('SELECT strBusinessUnitCode AS SBU, strBusinessUnitName AS SBUName FROM dco.tblbusinessunitArc ORDER BY strBusinessUnitCode');
    await sbuPool.close();
    const targetSet = new Set(Object.keys(SBU_NAMES));
    const sbus = sbuResult.recordset.filter(r => targetSet.has(r.SBU));
    console.log('SBUs matched:', sbus.length);
    sbus.forEach(r => console.log('  ', r.SBU, '-', r.SBUName));

    const pool = await sql.connect(config);
    const qry = "SELECT r.intItemId, ISNULL(r.strItemName,'Unknown') AS ItemName, r.monTransactionValue AS value, r.numTransactionQuantity AS qty, ISNULL(h.strTransactionTypeName,'') AS txnType, b.strBusinessUnitCode AS SBU FROM wms.tblInventoryTransactionRowArc r JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId WHERE h.TransactionGroupId = 2 AND h.dteTransactionDate >= '2026-07-01'";
    const txnResult = await sql.query(qry);
    await pool.close();
    console.log('Total txn rows:', txnResult.recordset.length);

    const itemData = {};
    txnResult.recordset.forEach(r => {
      if (!targetSet.has(r.SBU)) return;
      const sbuKey = r.SBU; const itemKey = r.ItemName;
      if (!itemData[sbuKey]) itemData[sbuKey] = {};
      if (!itemData[sbuKey][itemKey]) itemData[sbuKey][itemKey] = { totalValue: 0, totalQty: 0, consumptions: [], txnTypes: new Set() };
      const item = itemData[sbuKey][itemKey];
      item.totalValue += r.value; item.totalQty += r.qty;
      if (r.txnType) { item.consumptions.push({ value: r.value, qty: r.qty, type: r.txnType }); item.txnTypes.add(r.txnType); }
    });

    const slobResults = {};
    for (const sbu of Object.keys(itemData)) {
      slobResults[sbu] = {};
      for (const [itemName, item] of Object.entries(itemData[sbu])) {
        const hasShopFloor = item.consumptions.some(c => /shop\.floor/i.test(c.type));
        const zeroConsumption = !hasShopFloor;
        const itemLower = itemName.toLowerCase();
        const isRM = /raw|cement|steel|coal|grain|pulse|feed|rice|flour|meal/.test(itemLower) || item.txnTypes.has('Issue For Shop Floor');
        const isPM = /pack|bag|carton|label|pouch|wrapper|sack|sticker|tin|can|cap|liner|bottle/.test(itemLower) || item.txnTypes.has('Issue For Shop Floor');
        slobResults[sbu][itemName] = { totalValue: item.totalValue, totalQty: item.totalQty, zeroConsumption, isRM, isPM, txnTypes: [...item.txnTypes] };
      }
    }

    const slobSummary = {};
    for (const sbu of Object.keys(slobResults)) {
      slobSummary[sbu] = { rmSLOB: 0, pmSLOB: 0, totalInventory: 0, rmCount: 0, pmCount: 0 };
      for (const [itemName, item] of Object.entries(slobResults[sbu])) {
        if (item.zeroConsumption) {
          if (item.isRM) { slobSummary[sbu].rmSLOB += Math.abs(item.totalValue); slobSummary[sbu].rmCount++; }
          else if (item.isPM) { slobSummary[sbu].pmSLOB += Math.abs(item.totalValue); slobSummary[sbu].pmCount++; }
          else { slobSummary[sbu].totalInventory += Math.abs(item.totalValue); }
        } else { slobSummary[sbu].totalInventory += Math.abs(item.totalValue); }
      }
    }

    console.log('=== SLOB SUMMARY FOR ALL 10 SBUs (Jul 2026 - Aug 2026) ===');
    for (const sbu of Object.keys(SBU_NAMES)) {
      const s = slobSummary[sbu] || { rmSLOB:0, pmSLOB:0, totalInventory:0, rmCount:0, pmCount:0 };
      console.log('SBU: ' + SBU_NAMES[sbu]);
      console.log('  RM SLOB: ' + s.rmSLOB.toFixed(2) + ' Cr (' + s.rmCount + ' items)');
      console.log('  PM SLOB: ' + s.pmSLOB.toFixed(2) + ' Cr (' + s.pmCount + ' items)');
      console.log('  Total Inventory (non-SLOB): ' + s.totalInventory.toFixed(2) + ' Cr');
      console.log('');
    }
  } catch (err) { console.error('Error:', err.message); }
}
run();
