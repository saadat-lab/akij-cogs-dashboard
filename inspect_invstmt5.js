const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const mssql = require(mssqlPath);
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 600000 } };
const BU = process.argv[2] || 'AAFL';
const BUNAME = BU==='AAFL' ? '%Agro Feed%' : '%Hashem%';
const isRM = (s) => /raw|cement|steel|coal|grain|pulse|feed|rice|flour|meal|soy|maize|corn|husk|bran|seed|oil|salt|sugar|wheat/.test(s);
const isPM = (s) => /pack|bag|carton|label|pouch|wrapper|sack|sticker|tin|can|cap|liner|bottle|film|tape|strap|jute|gunny|pp |bopp|laminated/.test(s);
function classify(s){ const l=s.toLowerCase(); return isRM(l)?'RM':(isPM(l)?'PM':'Other'); }
async function run(){
  try{
    const pool = await mssql.connect(config);
    const meta = await pool.request().query(`SELECT MAX(dteTransactionDate) AS maxdt, MIN(dteTransactionDate) AS mindt, COUNT(DISTINCT strItemName) AS items FROM DataMart.inv.tblInventoryStatement WHERE [Business Unit] LIKE '${BUNAME}'`);
    console.log(BU+' statement date range: '+meta.recordset[0].mindt+' .. '+meta.recordset[0].maxdt+' | distinct items='+meta.recordset[0].items);
    const q1 = `WITH base AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY [Business Unit], strItemName, Warehouse ORDER BY dteTransactionDate DESC) AS rn FROM DataMart.inv.tblInventoryStatement WHERE [Business Unit] LIKE '${BUNAME}'),
      latest AS (SELECT * FROM base WHERE rn=1)
      SELECT strItemName, SUM(ClosingStock*AvgRate) AS closingVal FROM latest GROUP BY strItemName`;
    const v = await pool.request().query(q1);
    const q2 = `SELECT strItemName,
        SUM(CASE WHEN IssueOrreceivedQty < 0 AND dteTransactionDate >= '2026-03-01' THEN 1 ELSE 0 END) AS neg6,
        SUM(CASE WHEN dteTransactionDate >= '2026-03-01' THEN 1 ELSE 0 END) AS any6
      FROM DataMart.inv.tblInventoryStatement WHERE [Business Unit] LIKE '${BUNAME}' GROUP BY strItemName`;
    const c = await pool.request().query(q2);
    await pool.close();
    const vals={}, cons={}, any6={};
    v.recordset.forEach(r=>vals[r.strItemName]=r.closingVal||0);
    c.recordset.forEach(r=>{cons[r.strItemName]=r.neg6||0; any6[r.strItemName]=r.any6||0;});
    const tot={RM:0,PM:0,Other:0}, slob={RM:0,PM:0,Other:0};
    let itemsWithVal=0, slobItems=0;
    Object.keys(vals).forEach(it=>{
      const cv=vals[it]; if(cv<=0) return;
      const t=classify(it); itemsWithVal++;
      tot[t]+=cv;
      if((cons[it]||0)===0){ slob[t]+=cv; slobItems++; }
    });
    console.log('By classification (closing value, Cr):');
    ['RM','PM','Other'].forEach(t=>console.log('  '+t+': Total='+(tot[t]/1e7).toFixed(2)+' | SLOB='+(slob[t]/1e7).toFixed(2)+' ('+(slob[t]/tot[t]*100).toFixed(2)+'%)'));
    console.log('ALL: Total='+( (tot.RM+tot.PM+tot.Other)/1e7 ).toFixed(2)+' | SLOB='+( (slob.RM+slob.PM+slob.Other)/1e7 ).toFixed(2));
    if(BU==='AAFL') console.log('CSV: Total 100.64 (RM 95.64 + PM 5.00) | SLOB 1.09 (RM 0.01 + PM 1.08)');
  }catch(e){console.error('ERR',e.message);}
}
run();
