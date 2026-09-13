const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const fs = require('fs');
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 600000 } };
const BUNAME = '%Hashem%';
const isRM = (s) => /raw|cement|steel|coal|grain|pulse|feed|rice|flour|meal|soy|maize|corn|husk|bran|seed|oil|salt|sugar|wheat|paddy|dal/.test(s);
const isPM = (s) => /pack|bag|carton|label|pouch|wrapper|sack|sticker|tin|can|cap|liner|bottle|film|tape|strap|jute|gunny|pp |bopp|laminated/.test(s);
function classify(s){ const l=s.toLowerCase(); return isRM(l)?'RM':(isPM(l)?'PM':'Other'); }
async function getItemCodeMap(pool){
  const r = await pool.request().query(`SELECT strItemName, strItemCode FROM (SELECT strItemName, strItemCode, ROW_NUMBER() OVER (PARTITION BY strItemName ORDER BY dteLastActionDateTime DESC) rn FROM itm.tblItemArc WHERE isActive=1) x WHERE rn=1`);
  const m={}; r.recordset.forEach(row=>m[row.strItemName]=row.strItemCode); return m;
}
async function getHRMLPeriod(pool, asOf, codeMap){
  const base = `FROM DataMart.inv.tblInventoryStatement WHERE [Business Unit] LIKE '${BUNAME}' AND dteTransactionDate <= '${asOf}'`;
  const q1 = `WITH b AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY [Business Unit], strItemName, Warehouse ORDER BY dteTransactionDate DESC) AS rn ${base}), latest AS (SELECT * FROM b WHERE rn=1) SELECT l.strItemName, SUM(l.ClosingStock * ISNULL(itm.numAverageRate, l.AvgRate)) AS closingVal FROM latest l LEFT JOIN (SELECT strItemName, numAverageRate, ROW_NUMBER() OVER (PARTITION BY strItemName ORDER BY dteLastActionDateTime DESC) rn FROM itm.tblItemArc WHERE isActive=1) itm ON itm.strItemName=l.strItemName AND itm.rn=1 GROUP BY l.strItemName`;
  const q2 = `SELECT strItemName, SUM(CASE WHEN IssueOrreceivedQty < 0 THEN 1 ELSE 0 END) AS neg6 FROM DataMart.inv.tblInventoryStatement WHERE [Business Unit] LIKE '${BUNAME}' AND dteTransactionDate >= CAST(DATEADD(month, DATEDIFF(month, 0, '${asOf}') - 6, 0) AS DATE) AND dteTransactionDate <= '${asOf}' GROUP BY strItemName`;
  const v = await pool.request().query(q1);
  const c = await pool.request().query(q2);
  const vals={}, cons={};
  v.recordset.forEach(r=>vals[r.strItemName]=r.closingVal||0);
  c.recordset.forEach(r=>cons[r.strItemName]=r.neg6||0);
  const tot={RM:0,PM:0,Other:0}, slob={RM:0,PM:0,Other:0};
  const cnt={rmItems:0,pmItems:0,otherItems:0,rmSlob:0,pmSlob:0,otherSlob:0,totalItems:0,totalSlob:0};
  const items=[];
  Object.keys(vals).forEach(it=>{
    const cv=vals[it]; if(cv<=0) return;
    const t=classify(it); const tl=t.toLowerCase(); const zero=(cons[it]||0)===0;
    cnt.totalItems++; cnt[tl+'Items']++;
    tot[t]+=cv; if(zero){ slob[t]+=cv; cnt[tl+'Slob']++; cnt.totalSlob++; }
    items.push({item:it, itemCode: codeMap[it]||'', type:t, closingValue:Math.round(cv), zeroCons:zero, neg6:cons[it]||0});
  });
  return { values:{ RM:{total:tot.RM/1e7, slob:slob.RM/1e7, pct: tot.RM>0?+(slob.RM/tot.RM*100).toFixed(2):0}, PM:{total:tot.PM/1e7, slob:slob.PM/1e7, pct: tot.PM>0?+(slob.PM/tot.PM*100).toFixed(2):0}, Other:{total:tot.Other/1e7, slob:slob.Other/1e7, pct: tot.Other>0?+(slob.Other/tot.Other*100).toFixed(2):0}, totalInv:(tot.RM+tot.PM+tot.Other)/1e7, slobTotal:(slob.RM+slob.PM+slob.Other)/1e7 }, counts:cnt, items };
}
async function run(){
  try{
    const pool = await sql.connect(config);
    const codeMap = await getItemCodeMap(pool);
    console.log('Item code map: '+Object.keys(codeMap).length+' names');
    const today = new Date();
    const iso = d => d.toISOString().split('T')[0];
    const asOf1 = iso(today);
    const key1 = asOf1.slice(0,7);
    const prevEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const asOf2 = iso(prevEnd);
    const key2 = asOf2.slice(0,7);
    const periods = {};
    periods[key1] = await getHRMLPeriod(pool, asOf1, codeMap);
    periods[key2] = await getHRMLPeriod(pool, asOf2, codeMap);
    await pool.close();
    const out={ sbu:'HRML', sbuName:'HRML Hashem Rice Mills', source:'DataMart.inv.tblInventoryStatement + itm.numAverageRate (iBOS)', window:'6-mo trailing from 1st (as of '+asOf1+')', periods };
    fs.writeFileSync('C:\\Users\\saada\\OneDrive\\Documents\\Default Project\\slob_ibos_hrml.js','const SLOB_IBOS_HRML = '+JSON.stringify(out)+';');
    console.log('Saved slob_ibos_hrml.js (iBOS) as-of '+asOf1);
    Object.keys(periods).sort().reverse().forEach(k=>{
      const p=periods[k];
      console.log(k+' ('+(k===key1?asOf1:asOf2)+'): RM total='+p.values.RM.total.toFixed(2)+' SLOB='+p.values.RM.slob.toFixed(2)+' | PM total='+p.values.PM.total.toFixed(2)+' SLOB='+p.values.PM.slob.toFixed(2)+' | All='+p.values.totalInv.toFixed(2)+' SLOB='+p.values.slobTotal.toFixed(2));
    });
  }catch(e){console.error('ERR',e.message);}
}
run();
