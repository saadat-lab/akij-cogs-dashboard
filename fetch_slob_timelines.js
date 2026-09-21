const mssqlPath = 'C:\\Users\\saada\\AppData\\Local\\npm-cache\\_npx\\ffdd41263fd07c20\\node_modules\\mssql';
const sql = require(mssqlPath);
const fs = require('fs');
const config = { server: '203.202.241.211', port: 1433, user: 'mcp_user', password: 'iAOS@35o997', database: 'DWH', options: { encrypt: false, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 600000 } };

// SBU BusinessUnitIds mapped earlier
const SBUS = [
  {code:'AEL', id:144},
  {code:'HRML', id:188},
  {code:'FAL', id:189},
  {code:'AAFL', id:232},
];

async function getSlobCodes(pool){
  // extract from existing slob_*.js if they exist, else from itm directly (all active items per SBU)
  const codes = new Set();
  const files = {AEL:'slob_ael.js', HRML:'slob_hrml.js', FAL:'slob_fal.js', AAFL:'slob_aafl.js'};
  for(const sbu of SBUS){
    const f = files[sbu.code];
    try{
      const txt = fs.readFileSync(f,'utf8');
      const m = txt.match(/"periods":\{([\s\S]*?)\}\}\}\;/);
      // simpler: extract all itemCode via regex
      const re = /"itemCode":"([^"]+)"/g;
      let match; let cnt=0;
      while((match=re.exec(txt))!==null){ if(match[1]){ codes.add(match[1]); cnt++; } }
      console.log(sbu.code+': extracted '+cnt+' codes from '+f+' (unique total '+codes.size+')');
    }catch(e){ console.log('skip '+f+': '+e.message); }
  }
  // fallback: if <100 codes, fetch all active items per SBU
  if(codes.size < 100){
    console.log('Fallback: fetching all active item codes per SBU from itm.tblItemArc');
    for(const sbu of SBUS){
      const r = await pool.request().query(`SELECT strItemCode FROM itm.tblItemArc WHERE isActive=1 AND intBusinesUnitId=${sbu.id} AND strItemCode IS NOT NULL AND strItemCode<>''`);
      r.recordset.forEach(row=>{ if(row.strItemCode) codes.add(row.strItemCode); });
      console.log(sbu.code+': total codes now '+codes.size);
    }
  }
  return [...codes].filter(c=>c && c.length>0);
}

async function getItemIdMap(pool, codes){
  const mapCodeToId = {}; const mapIdToCode = {};
  // chunk codes into batches of 500 to avoid too large IN clause
  const chunk = 500;
  for(let i=0;i<codes.length;i+=chunk){
    const batch = codes.slice(i,i+chunk);
    const inList = batch.map(c=>`'${c.replace(/'/g,"''")}'`).join(',');
    const q = `SELECT intItemId, strItemCode FROM itm.tblItemArc WHERE strItemCode IN (${inList})`;
    const r = await pool.request().query(q);
    r.recordset.forEach(row=>{
      mapCodeToId[row.strItemCode]=row.intItemId;
      mapIdToCode[row.intItemId]=row.strItemCode;
    });
  }
  console.log('Mapped '+Object.keys(mapCodeToId).length+' codes to intItemId');
  return {mapCodeToId, mapIdToCode};
}

async function fetchBatch(pool, itemIds){
  const result = {}; // code -> {pr:[], po:[], grn:[]}
  // init empty
  // Build IN list for itemIds (numeric, no quotes)
  const chunk = 500;
  const allIds = [...itemIds];
  // Fetch PRs in chunks
  for(let i=0;i<allIds.length;i+=chunk){
    const batch = allIds.slice(i,i+chunk);
    const inList = batch.join(',');
    if(!inList) continue;
    const qPR = `
      SELECT r.intItemId, r.strItemCode, h.strPurchaseRequestCode as doc, h.dteRequestDate as dte, r.numRequestQuantity as qty, h.intActionBy as reqById, u1.strUserName as reqBy, h.dteApprovedDateTime as apprDte, h.intApprovedBy as apprById, u2.strUserName as apprBy
      FROM pro.tblPurchaseRequestHeaderArc h
      JOIN pro.tblPurchaseRequestRowArc r ON r.intPurchaseRequestId=h.intPurchaseRequestId
      LEFT JOIN dco.tblUserArc u1 ON u1.intUserId=h.intActionBy
      LEFT JOIN dco.tblUserArc u2 ON u2.intUserId=h.intApprovedBy
      WHERE r.intItemId IN (${inList})
      ORDER BY h.dteRequestDate DESC`;
    try{
      const prRes = await pool.request().query(qPR);
      prRes.recordset.forEach(row=>{
        const code = row.strItemCode || row.intItemId;
        if(!result[code]) result[code]={pr:[],po:[],grn:[]};
        // rate for PR: not stored as price per unit in this schema, but we can compute if needed; for now show qty only, rate = amount/qty if available else null
        result[code].pr.push({
          date: row.dte ? new Date(row.dte).toISOString().split('T')[0] : '',
          doc: row.doc,
          qty: Number(row.qty||0),
          // PR has no rate per unit in row; store 0 and amount not available
          rate: 0,
          amount: 0,
          user: row.reqBy || ('User '+row.reqById),
          approver: row.apprBy ? (row.apprBy + (row.apprDte ? ' '+ new Date(row.apprDte).toISOString().split('T')[0] : '')) : (row.apprDte ? new Date(row.apprDte).toISOString().split('T')[0] : ''),
          status: 'Approved'
        });
      });
    }catch(e){ console.log('PR batch err',e.message.substring(0,200)); }
  }
  // Fetch POs in chunks
  for(let i=0;i<allIds.length;i+=chunk){
    const batch = allIds.slice(i,i+chunk);
    const inList = batch.join(',');
    if(!inList) continue;
    const qPO = `
      SELECT r.intItemId, r.strItemName, h.strPurchaseOrderNo as doc, h.dtePurchaseOrderDate as dte, r.numOrderQty as qty, r.numBasePrice as basePrice, r.numTotalValue as totalVal, h.strBusinessPartnerName as supplier, h.intActionBy as issuedById, u1.strUserName as issuedBy, h.dteApproveDatetime as apprDte, h.intApproveBy as apprById, u2.strUserName as apprBy, r.numReceiveQty as recvQty
      FROM pro.tblPurchaseOrderHeaderArc h
      JOIN pro.tblPurchaseOrderRowArc r ON r.intPurchaseOrderId=h.intPurchaseOrderId
      LEFT JOIN dco.tblUserArc u1 ON u1.intUserId=h.intActionBy
      LEFT JOIN dco.tblUserArc u2 ON u2.intUserId=h.intApproveBy
      WHERE r.intItemId IN (${inList})
      ORDER BY h.dtePurchaseOrderDate DESC`;
    try{
      const poRes = await pool.request().query(qPO);
      poRes.recordset.forEach(row=>{
        // need to map intItemId to code via lookup; but we have code via join? r doesn't have strItemCode, so we need map
        // do lookup via map later; for now store by intItemId string
        const key = String(row.intItemId);
        if(!result[key]) result[key]={pr:[],po:[],grn:[]};
        let rate = Number(row.basePrice||0);
        let amount = Number(row.totalVal||0);
        // if rate looks like total (e.g., 18400 for qty 200), derive per-unit
        if(rate > 1000 && Number(row.qty)>0 && Math.abs(rate - amount) < 1) {
          rate = amount / Number(row.qty);
        }
        // fallback: if basePrice is 0, compute from totalVal/qty
        if((!rate || rate===0) && Number(row.qty)>0 && amount>0) rate = amount / Number(row.qty);
        result[key].po.push({
          date: row.dte ? new Date(row.dte).toISOString().split('T')[0] : '',
          doc: row.doc,
          qty: Number(row.qty||0),
          rate: Number(rate.toFixed(2)),
          amount: Number(amount),
          user: row.issuedBy || ('User '+row.issuedById),
          approver: row.apprBy ? (row.apprBy + (row.apprDte ? ' '+new Date(row.apprDte).toISOString().split('T')[0] : '')) : '',
          supplier: row.supplier || '',
          status: 'Issued'
        });
      });
    }catch(e){ console.log('PO batch err',e.message.substring(0,200)); }
  }
  // Fetch GRNs (Receive Inventory) in chunks
  for(let i=0;i<allIds.length;i+=chunk){
    const batch = allIds.slice(i,i+chunk);
    const inList = batch.join(',');
    if(!inList) continue;
    const qGRN = `
      SELECT r.intItemId, h.strInventoryTransactionCode as doc, h.dteTransactionDate as dte, h.strWarehouseName as wh, h.strBusinessPartnerName as supplier, h.intActionBy as confById, u.strUserName as confBy, r.numTransactionQuantity as qty, r.monTransactionValue as val
      FROM wms.tblInventoryTransactionHeaderArc h
      JOIN wms.tblInventoryTransactionRowArc r ON r.intInventoryTransactionId=h.intInventoryTransactionId
      LEFT JOIN dco.tblUserArc u ON u.intUserId=h.intActionBy
      WHERE r.intItemId IN (${inList}) AND h.TransactionGroupName='Receive Inventory'
      ORDER BY h.dteTransactionDate DESC`;
    try{
      const grnRes = await pool.request().query(qGRN);
      grnRes.recordset.forEach(row=>{
        const key = String(row.intItemId);
        if(!result[key]) result[key]={pr:[],po:[],grn:[]};
        const qty = Number(row.qty||0);
        const val = Number(row.val||0);
        let rate = qty!==0 ? val/qty : 0;
        result[key].grn.push({
          date: row.dte ? new Date(row.dte).toISOString().split('T')[0] : '',
          doc: row.doc,
          qty: qty,
          rate: Number(rate.toFixed(2)),
          amount: Number(val.toFixed(2)),
          user: row.confBy || ('User '+row.confById),
          supplier: row.wh ? (row.wh + (row.supplier ? ' / '+row.supplier : '')) : (row.supplier||''),
          status: 'Received'
        });
      });
    }catch(e){ console.log('GRN batch err',e.message.substring(0,200)); }
  }
  return result;
}

async function run(){
  try{
    const pool = await sql.connect(config);
    console.log('Connected');
    const codes = await getSlobCodes(pool);
    console.log('Total SLOB codes to map: '+codes.length);
    const {mapCodeToId, mapIdToCode} = await getItemIdMap(pool, codes);
    const ids = Object.values(mapCodeToId);
    console.log('ItemIds to fetch: '+ids.length);
    if(ids.length===0){ console.log('No ids'); await pool.close(); return; }
    const raw = await fetchBatch(pool, ids);
    // Remap from intItemId keys to strItemCode where needed
    const byCode = {};
    // First, for entries keyed by strItemCode (PR) keep as is; for intItemId keys, map
    for(const k of Object.keys(raw)){
      let code = k;
      if(/^\d+$/.test(k) && mapIdToCode[k]) code = mapIdToCode[k];
      if(!byCode[code]) byCode[code]={pr:[],po:[],grn:[]};
      // merge
      if(raw[k].pr) byCode[code].pr = (byCode[code].pr||[]).concat(raw[k].pr);
      if(raw[k].po) byCode[code].po = (byCode[code].po||[]).concat(raw[k].po);
      if(raw[k].grn) byCode[code].grn = (byCode[code].grn||[]).concat(raw[k].grn);
    }
    // For codes that were originally intItemId-keyed but also have pr entries under code string, merge already done via loop
    // Now create final object keyed by itemCode with sbu hint
    const out = {};
    for(const code of codes){
      const entry = byCode[code] || {pr:[],po:[],grn:[]};
      // sort each by date desc and limit to last 10 per type to keep file small
      entry.pr.sort((a,b)=> b.date.localeCompare(a.date));
      entry.po.sort((a,b)=> b.date.localeCompare(a.date));
      entry.grn.sort((a,b)=> b.date.localeCompare(a.date));
      // keep up to 10 each
      entry.pr = entry.pr.slice(0,10);
      entry.po = entry.po.slice(0,10);
      entry.grn = entry.grn.slice(0,10);
      // only keep if has any history OR is SLOB (to show placeholder) — keep all to allow lookup
      out[code] = entry;
    }
    await pool.close();
    const js = 'const SLOB_TIMELINES = '+JSON.stringify(out)+';';
    fs.writeFileSync('C:\\Users\\saada\\OneDrive\\Documents\\Default Project\\slob_timelines.js', js);
    console.log('Wrote slob_timelines.js with '+Object.keys(out).length+' codes');
    // stats
    let withPR=0, withPO=0, withGRN=0, withAny=0;
    for(const c of Object.keys(out)){ const e=out[c]; if(e.pr.length) withPR++; if(e.po.length) withPO++; if(e.grn.length) withGRN++; if(e.pr.length||e.po.length||e.grn.length) withAny++; }
    console.log('Stats: withPR '+withPR+' withPO '+withPO+' withGRN '+withGRN+' withAny '+withAny+' noHistory '+(Object.keys(out).length-withAny));
  }catch(e){
    console.error('ERR',e.message);
    console.error(e.stack);
  }
}
run();
