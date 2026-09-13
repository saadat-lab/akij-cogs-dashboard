const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const fs = require('fs');
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 600000 } };
const BUNAME = '%Fariq Agro%';
// PM must be checked first — many bags contain rice variety names so they would otherwise be tagged RM.
const isPM = (s) => /pack|bag|carton|label|pouch|wrapper|sack|sticker|tin|can|cap|liner|bottle|film|tape|strap|jute|gunny|pp |bopp|laminated|hessian|poly|woven|sieve|sensor|cable|bar|sheet/.test(s);
const isRM = (s) => /raw|cement|steel|coal|grain|pulse|feed|rice|flour|meal|soy|maize|corn|husk|bran|seed|oil|salt|sugar|wheat|paddy|dal|chinig|katari|najir|miniket|paijam|shorna|parija|hybrid|atop|bogi|mota|chikon|kalijira|sona|samba|bora|godown|moti/.test(s);
function classify(s){ const l=s.toLowerCase(); return isPM(l)?'PM':(isRM(l)?'RM':'Other'); }

async function getItemCodeMap(pool){
  const r = await pool.request().query(`SELECT strItemName, strItemCode FROM (SELECT strItemName, strItemCode, ROW_NUMBER() OVER (PARTITION BY strItemName ORDER BY dteLastActionDateTime DESC) rn FROM itm.tblItemArc WHERE isActive=1) x WHERE rn=1`);
  const m={}; r.recordset.forEach(row=>m[row.strItemName]=row.strItemCode); return m;
}
async function period(pool, asOf, key, codeMap){
  const base = `FROM DataMart.inv.tblInventoryStatement WHERE [Business Unit] LIKE '${BUNAME}' AND dteTransactionDate <= '${asOf}'`;
  const q1 = `WITH b AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY [Business Unit], strItemName, Warehouse ORDER BY dteTransactionDate DESC) AS rn ${base}), latest AS (SELECT * FROM b WHERE rn=1) SELECT strItemName, SUM(ClosingStock*AvgRate) AS closingVal FROM latest GROUP BY strItemName`;
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
  return {
    values:{
      RM:{total:tot.RM/1e7, slob:slob.RM/1e7, pct: tot.RM>0?+(slob.RM/tot.RM*100).toFixed(2):0},
      PM:{total:tot.PM/1e7, slob:slob.PM/1e7, pct: tot.PM>0?+(slob.PM/tot.PM*100).toFixed(2):0},
      Other:{total:tot.Other/1e7, slob:slob.Other/1e7, pct: tot.Other>0?+(slob.Other/tot.Other*100).toFixed(2):0},
      totalInv:(tot.RM+tot.PM+tot.Other)/1e7, slobTotal:(slob.RM+slob.PM+slob.Other)/1e7
    },
    counts:cnt, items
  };
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
    const p1 = await period(pool, asOf1, key1, codeMap);
    periods[key1] = p1;
    const p2 = await period(pool, asOf2, key2, codeMap);
    periods[key2] = p2;
    await pool.close();
    const out = { sbu:'FAL', sbuName:'Fariq Agro Ltd.', source:'DataMart.inv.tblInventoryStatement', window:'6-mo trailing (as of '+asOf1+')', periods };
    fs.writeFileSync('C:\\Users\\saada\\OneDrive\\Documents\\Default Project\\slob_fal.js','const SLOB_FAL = '+JSON.stringify(out)+';');
    console.log('Saved slob_fal.js (statement-based) as-of '+asOf1);
    Object.keys(periods).sort().reverse().forEach(k=>{
      const p=periods[k];
      console.log(k+' ('+(k===key1?asOf1:asOf2)+'): RM total='+p.values.RM.total.toFixed(2)+' SLOB='+p.values.RM.slob.toFixed(2)+' ('+p.values.RM.pct+'%) | PM total='+p.values.PM.total.toFixed(2)+' SLOB='+p.values.PM.slob.toFixed(2)+' ('+p.values.PM.pct+'%) | Other total='+p.values.Other.total.toFixed(2)+' SLOB='+p.values.Other.slob.toFixed(2)+' | All='+p.values.totalInv.toFixed(2)+' SLOB='+p.values.slobTotal.toFixed(2));
    });
  }catch(e){console.error('ERR',e.message); console.error(e.stack);}
}
run();
