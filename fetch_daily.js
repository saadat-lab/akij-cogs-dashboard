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

  console.log('Fetching daily consumption data...');
  const res = await pool.request().query(`
    WITH item_data AS (
      SELECT
        CONVERT(DATE, h.dteTransactionDate) AS dt,
        b.strBusinessUnitCode AS sbu,
        h.strTransactionTypeName AS txn,
        COALESCE(m.strItemMasterTypeName,
          CASE
            WHEN r.strItemName LIKE '%PPW Bag%' OR r.strItemName LIKE '%Bag%' OR r.strItemName LIKE '%Carton%' OR r.strItemName LIKE '%Label%' OR r.strItemName LIKE '%Sack%' OR r.strItemName LIKE '%Pouch%' OR r.strItemName LIKE '%Liner%' OR r.strItemName LIKE '%Bottle%' OR r.strItemName LIKE '%Sticker%' OR r.strItemName LIKE '%Wrapper%' OR r.strItemName LIKE '%Tin%' OR r.strItemName LIKE '%Can%' OR r.strItemName LIKE '%Cap%' THEN 'Packaging Materials'
            ELSE 'Other'
          END
        ) AS mtype,
        r.monTransactionValue AS val
      FROM wms.tblInventoryTransactionRowArc r
      JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId
      JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId
      LEFT JOIN itm.tblItemMasterArc m ON r.intItemId = m.intItemMasterId
      WHERE h.intBusinessUnitId IN (${SBU_IDS.join(',')})
        AND h.dteTransactionDate >= '2024-07-01'
        AND h.TransactionGroupId = 2
    )
    SELECT dt, sbu, txn, mtype,
      ROUND(SUM(val) / 1000000, 3) AS value_m
    FROM item_data
    GROUP BY dt, sbu, txn, mtype
    ORDER BY dt, sbu, txn, mtype
  `);
  console.log(`Fetched ${res.recordset.length} daily rows`);

  const daily = res.recordset.map(r => [
    r.dt.toISOString().split('T')[0],
    r.sbu,
    r.txn,
    r.mtype,
    r.value_m
  ]);

  fs.writeFileSync(OUT + '\\daily_items.js', 'const DAILY_DATA = ' + JSON.stringify(daily) + ';');
  console.log('Saved daily_items.js');

  await pool.close();
  console.log('Done!');
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });