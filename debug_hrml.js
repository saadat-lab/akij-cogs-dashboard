const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const mssql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 600000 } };
const BUNAME = '%Hashem%';
const isRM = (s) => /raw|cement|steel|coal|grain|pulse|feed|rice|flour|meal|soy|maize|corn|husk|bran|seed|oil|salt|sugar|wheat|paddy|dal/.test(s);
const isPM = (s) => /pack|bag|carton|label|pouch|wrapper|sack|sticker|tin|can|cap|liner|bottle|film|tape|strap|jute|gunny|pp |bopp|laminated/.test(s);
function classify(s){ const l=s.toLowerCase(); return isRM(l)?'RM':(isPM(l)?'PM':'Other'); }
async function run(){
  try{
    const pool = await mssql.connect(config);
    const q1 = `WITH base AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY [Business Unit], strItemName, Warehouse ORDER BY dteTransactionDate DESC) AS rn FROM DataMart.inv.tblInventoryStatement WHERE [Business Unit] LIKE '${BUNAME}'),
      latest AS (SELECT * FROM base WHERE rn=1)
      SELECT strItemName, SUM(ClosingStock*AvgRate) AS closingVal FROM latest GROUP BY strItemName`;
    const v = await pool.request().query(q1);
    await pool.close();
    const arr = v.recordset.map(r=>({item:r.strItemName, cv:r.closingVal||0, t:classify(r.strItemName)})).filter(x=>x.cv>0).sort((a,b)=>b.cv-a.cv);
    console.log('TOP 15 HRML items by closing value (fetch classifier):');
    arr.slice(0,15).forEach(x=>console.log('  ['+x.t+'] '+(x.cv/1e7).toFixed(2)+' Cr  '+x.item.substring(0,50)));
    const tot={RM:0,PM:0,Other:0}; arr.forEach(x=>tot[x.t]+=x.cv);
    console.log('TOTALS: RM='+(tot.RM/1e7).toFixed(2)+' PM='+(tot.PM/1e7).toFixed(2)+' Other='+(tot.Other/1e7).toFixed(2));
  }catch(e){console.error('ERR',e.message);}
}
run();
