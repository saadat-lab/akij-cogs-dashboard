const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const fs = require('fs');

const CONFIG = {
  server: '203.202.241.211', port: 1433,
  user: 'mcp_user', password: 'iAOS@35o997',
  database: 'DWH',
  options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 300000 }
};

const SBU_IDS = [4, 224, 144, 8, 175, 220, 188, 189, 232, 237];
const OUT = 'C:\\Users\\saada\\OneDrive\\Documents\\Default Project';

async function run() {
  console.log('Connecting...');
  const pool = await sql.connect(CONFIG);

  // 1. ITEMS DATA with transaction type
  console.log('Fetching items data...');
  const itemsRes = await pool.request().query(`
    WITH item_data AS (
      SELECT b.strBusinessUnitCode, b.strBusinessUnitName,
        r.intItemId, r.strItemName,
        r.monTransactionValue, r.numTransactionQuantity,
        h.strTransactionTypeName,
        COALESCE(m.strItemMasterTypeName,
          CASE
            WHEN r.strItemName LIKE '%PPW Bag%' OR r.strItemName LIKE '%Bag%' OR r.strItemName LIKE '%Carton%' OR r.strItemName LIKE '%Label%' OR r.strItemName LIKE '%Sack%' OR r.strItemName LIKE '%Pouch%' OR r.strItemName LIKE '%Liner%' OR r.strItemName LIKE '%Bottle%' OR r.strItemName LIKE '%Sticker%' OR r.strItemName LIKE '%Wrapper%' OR r.strItemName LIKE '%Tin%' OR r.strItemName LIKE '%Can%' OR r.strItemName LIKE '%Cap%' THEN 'Packaging Materials'
            ELSE 'Other'
          END
        ) AS material_type
      FROM wms.tblInventoryTransactionRowArc r
      JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId
      JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId
      LEFT JOIN itm.tblItemMasterArc m ON r.intItemId = m.intItemMasterId
      WHERE h.intBusinessUnitId IN (${SBU_IDS.join(',')})
        AND h.dteTransactionDate >= '2024-07-01'
        AND h.TransactionGroupId = 2
    )
    SELECT strBusinessUnitCode, strBusinessUnitName, strItemName, material_type, strTransactionTypeName AS txn_type,
      SUM(monTransactionValue) AS total_value,
      SUM(numTransactionQuantity) AS total_qty,
      COUNT(*) AS txn_count
    FROM item_data
    GROUP BY strBusinessUnitCode, strBusinessUnitName, strItemName, material_type, strTransactionTypeName
    ORDER BY strBusinessUnitCode, total_value ASC
  `);
  console.log(`Fetched ${itemsRes.recordset.length} item rows`);

  const items = itemsRes.recordset.map(r => ({
    sbu: r.strBusinessUnitCode, sbuName: r.strBusinessUnitName,
    item: r.strItemName, type: r.material_type, txnType: r.txn_type,
    value: r.total_value, qty: r.total_qty, txn: r.txn_count
  }));
  fs.writeFileSync(OUT + '\\items_data.js', 'const ITEMS_DATA = ' + JSON.stringify(items) + ';');
  console.log('Saved items_data.js');

  // 2. MONTHLY DATA - indexed by composite key
  console.log('Fetching monthly data (Jul 2024 onwards)...');
  const monthlyRes = await pool.request().query(`
    SELECT b.strBusinessUnitCode AS sbu,
      r.strItemName AS item,
      h.strTransactionTypeName AS txn_type,
      YEAR(h.dteTransactionDate) AS yr,
      MONTH(h.dteTransactionDate) AS mon,
      SUM(r.monTransactionValue) AS value,
      SUM(r.numTransactionQuantity) AS qty,
      COUNT(*) AS txn
    FROM wms.tblInventoryTransactionRowArc r
    JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId
    JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId
    WHERE h.intBusinessUnitId IN (${SBU_IDS.join(',')})
        AND h.dteTransactionDate >= '2024-07-01'
        AND h.TransactionGroupId = 2
    GROUP BY b.strBusinessUnitCode, r.strItemName, h.strTransactionTypeName,
      YEAR(h.dteTransactionDate), MONTH(h.dteTransactionDate)
    ORDER BY sbu, item, txn_type, yr, mon
  `);
  console.log(`Fetched ${monthlyRes.recordset.length} monthly rows`);

  // Index by composite key: sbu|item|txnType -> [{yr,mon,value,qty,txn}]
  const monthlyMap = {};
  monthlyRes.recordset.forEach(r => {
    const key = `${r.sbu}|${r.item}|${r.txn_type}`;
    if (!monthlyMap[key]) monthlyMap[key] = [];
    monthlyMap[key].push({ yr: r.yr, mon: r.mon, value: r.value, qty: r.qty, txn: r.txn });
  });

  fs.writeFileSync(OUT + '\\monthly_items.js', 'const MONTHLY_DATA = ' + JSON.stringify(monthlyMap) + ';');
  console.log(`Saved monthly_items.js (${Object.keys(monthlyMap).length} keys)`);

  await pool.close();
  console.log('Done!');
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
