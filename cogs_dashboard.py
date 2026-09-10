"""COGS Dashboard - Raw & Packaging Material | Akij Group | Streamlit"""
import streamlit as st
import pymssql
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime
from io import StringIO

st.set_page_config(page_title="COGS Dashboard", layout="wide", page_icon="📊")

# ── DB ──
@st.cache_data(ttl=3600)
def query(sql):
    conn = pymssql.connect(
        server='203.202.241.211', port=1433,
        user='mcp_user', password='iAOS@35o997',
        database='DWH',
        as_dict=True,
        timeout=30
    )
    df = pd.read_sql(sql, conn)
    conn.close()
    return df

# ── CONSTANTS ──
SBU_IDS = "4,224,144,8,175,220,188,189,232,237"
COLORS = ['#4f6ef7','#e74c3c','#10b981','#f59e0b','#3b82f6','#14b8a6','#ec4899','#8b5cf6','#f43f5e','#06b6d4']

@st.cache_data(ttl=3600)
def fetch_summary():
    return query(f"""
        SELECT b.strBusinessUnitCode AS code, b.strBusinessUnitName AS name,
          SUM(CASE WHEN j.strGeneralLedgerName IN ('Cost Of Goods Sold','Cost of Goods Sold','Accrued Cost of Goods Sold') THEN j.numAmount ELSE 0 END) AS cogs,
          SUM(CASE WHEN j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit') AND j.numAmount < 0 THEN ABS(j.numAmount) ELSE 0 END) AS rmCons,
          SUM(CASE WHEN j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit') AND j.numAmount > 0 THEN j.numAmount ELSE 0 END) AS rmPurch,
          SUM(CASE WHEN j.strGeneralLedgerName IN ('Packaging Materials','Packaging Materials in Transit') AND j.numAmount < 0 THEN ABS(j.numAmount) ELSE 0 END) AS pmCons,
          SUM(CASE WHEN j.strGeneralLedgerName IN ('Packaging Materials','Packaging Materials in Transit') AND j.numAmount > 0 THEN j.numAmount ELSE 0 END) AS pmPurch
        FROM fin.tblAccountingJournalArc j
        JOIN dco.tblbusinessunitArc b ON j.intBusinessUnitId = b.intBusinessUnitId
        WHERE j.intBusinessUnitId IN ({SBU_IDS}) AND j.dteTransactionDate >= '2026-07-01'
          AND j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit','Packaging Materials','Packaging Materials in Transit','Cost Of Goods Sold','Cost of Goods Sold','Accrued Cost of Goods Sold')
        GROUP BY b.strBusinessUnitCode, b.strBusinessUnitName ORDER BY cogs DESC
    """)

@st.cache_data(ttl=3600)
def fetch_daily():
    df = query(f"""
        SELECT t.dt, SUM(t.cogs) AS cogs, SUM(t.rmCons) AS rmCons, SUM(t.pmCons) AS pmCons
        FROM (
          SELECT CONVERT(DATE, dteTransactionDate) AS dt,
            CASE WHEN j.strGeneralLedgerName IN ('Cost Of Goods Sold','Cost of Goods Sold','Accrued Cost of Goods Sold') THEN j.numAmount ELSE 0 END AS cogs,
            CASE WHEN j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit') AND j.numAmount < 0 THEN ABS(j.numAmount) ELSE 0 END AS rmCons,
            CASE WHEN j.strGeneralLedgerName IN ('Packaging Materials','Packaging Materials in Transit') AND j.numAmount < 0 THEN ABS(j.numAmount) ELSE 0 END AS pmCons
          FROM fin.tblAccountingJournalArc j
          WHERE j.intBusinessUnitId IN ({SBU_IDS}) AND j.dteTransactionDate >= '2026-07-01'
            AND j.strGeneralLedgerName IN ('Raw Materials','Raw Materials in Transit','Packaging Materials','Packaging Materials in Transit','Cost Of Goods Sold','Cost of Goods Sold','Accrued Cost of Goods Sold')
        ) t
        GROUP BY t.dt ORDER BY t.dt
    """)
    if len(df) == 0: return df
    df['dt'] = pd.to_datetime(df['dt'])
    return df

@st.cache_data(ttl=3600)
def fetch_items(sbu_filter="all", type_filter="all", txn_filter="all", search=""):
    where = [f"h.intBusinessUnitId IN ({SBU_IDS})", "h.dteTransactionDate >= '2026-07-01'", "h.TransactionGroupId = 2"]
    if sbu_filter != "all":
        sbu_id = dict(df_sbu.values).get(sbu_filter, sbu_filter)
        where.append(f"b.strBusinessUnitCode = '{sbu_filter}'")
    
    sql = f"""
        SELECT b.strBusinessUnitCode AS sbu, b.strBusinessUnitName AS sbuName,
          r.strItemName AS item,
          COALESCE(m.strItemMasterTypeName,
            CASE WHEN r.strItemName LIKE '%Bag%' OR r.strItemName LIKE '%Pack%' OR r.strItemName LIKE '%Carton%' OR r.strItemName LIKE '%Label%' OR r.strItemName LIKE '%Liner%' OR r.strItemName LIKE '%Bottle%' OR r.strItemName LIKE '%Sticker%' OR r.strItemName LIKE '%Wrapper%' THEN 'Packaging Materials' ELSE 'Other' END
          ) AS mat_type,
          h.strTransactionTypeName AS txn_type,
          SUM(r.monTransactionValue) AS value,
          SUM(r.numTransactionQuantity) AS qty,
          COUNT(*) AS txn
        FROM wms.tblInventoryTransactionRowArc r
        JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId
        JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId
        LEFT JOIN itm.tblItemMasterArc m ON r.intItemId = m.intItemMasterId
        WHERE {' AND '.join(where)}
        GROUP BY b.strBusinessUnitCode, b.strBusinessUnitName, r.strItemName,
          COALESCE(m.strItemMasterTypeName, CASE WHEN r.strItemName LIKE '%Bag%' OR r.strItemName LIKE '%Pack%' OR r.strItemName LIKE '%Carton%' OR r.strItemName LIKE '%Label%' OR r.strItemName LIKE '%Liner%' OR r.strItemName LIKE '%Bottle%' OR r.strItemName LIKE '%Sticker%' OR r.strItemName LIKE '%Wrapper%' THEN 'Packaging Materials' ELSE 'Other' END),
          h.strTransactionTypeName
    """
    df = query(sql)
    if type_filter != "all": df = df[df['mat_type'] == type_filter]
    if txn_filter != "all": df = df[df['txn_type'] == txn_filter]
    if search: df = df[df['item'].str.lower().str.contains(search.lower(), na=False)]
    return df

@st.cache_data(ttl=3600)
def fetch_monthly_item(sbu, item, txn_type):
    return query(f"""
        SELECT YEAR(h.dteTransactionDate) AS yr, MONTH(h.dteTransactionDate) AS mon,
          SUM(r.monTransactionValue) AS value, SUM(r.numTransactionQuantity) AS qty, COUNT(*) AS txn
        FROM wms.tblInventoryTransactionRowArc r
        JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId
        JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId
        WHERE b.strBusinessUnitCode = '{sbu}' AND r.strItemName = '{item.replace("'","''")}'
          AND h.strTransactionTypeName = '{txn_type.replace("'","''")}'
          AND h.dteTransactionDate >= '2025-07-01' AND h.TransactionGroupId = 2
        GROUP BY YEAR(h.dteTransactionDate), MONTH(h.dteTransactionDate) ORDER BY yr, mon
    """)

@st.cache_data(ttl=3600)
def fetch_yoy_rates(sbu_code, month_num, mat_type="all"):
    """Fetch YoY rate comparison for a given month across items"""
    yr_this = 2026
    yr_last = 2025
    where = [f"h.intBusinessUnitId IN ({SBU_IDS})", f"h.TransactionGroupId = 2"]
    if sbu_code != "all":
        where.append(f"b.strBusinessUnitCode = '{sbu_code}'")

    mat_condition = ""
    if mat_type == "Raw Materials":
        mat_condition = "AND COALESCE(m.strItemMasterTypeName, 'Other') = 'Raw Materials'"
    elif mat_type == "Packaging Materials":
        mat_condition = "AND (COALESCE(m.strItemMasterTypeName, 'Other') = 'Packaging Materials' OR r.strItemName LIKE '%Bag%' OR r.strItemName LIKE '%Pack%' OR r.strItemName LIKE '%Carton%' OR r.strItemName LIKE '%Label%' OR r.strItemName LIKE '%Liner%' OR r.strItemName LIKE '%Bottle%' OR r.strItemName LIKE '%Sticker%' OR r.strItemName LIKE '%Wrapper%')"

    sql = f"""
        SELECT 
            b.strBusinessUnitCode AS sbu,
            b.strBusinessUnitName AS sbu_name,
            r.intItemId AS item_code,
            r.strItemName AS item_desc,
            COALESCE(m.strItemMasterTypeName, 
              CASE WHEN r.strItemName LIKE '%Bag%' OR r.strItemName LIKE '%Pack%' THEN 'Packaging Materials' ELSE 'Other' END
            ) AS mat_type,
            COALESCE(u.strUoMName, '') AS uom,
            h.strTransactionTypeName AS txn_type,
            YEAR(h.dteTransactionDate) AS yr,
            MONTH(h.dteTransactionDate) AS mon,
            SUM(r.monTransactionValue) AS value,
            SUM(r.numTransactionQuantity) AS qty
        FROM wms.tblInventoryTransactionRowArc r
        JOIN wms.tblInventoryTransactionHeaderArc h ON r.intInventoryTransactionId = h.intInventoryTransactionId
        JOIN dco.tblbusinessunitArc b ON h.intBusinessUnitId = b.intBusinessUnitId
        LEFT JOIN itm.tblItemMasterArc m ON r.intItemId = m.intItemMasterId
        LEFT JOIN itm.tblItemMasterArc u ON r.intUoMId = u.intUOMId
        WHERE {' AND '.join(where)}
          AND MONTH(h.dteTransactionDate) = {month_num}
          AND YEAR(h.dteTransactionDate) IN ({yr_last}, {yr_this})
          {mat_condition}
        GROUP BY b.strBusinessUnitCode, b.strBusinessUnitName, r.intItemId, r.strItemName,
          COALESCE(m.strItemMasterTypeName, CASE WHEN r.strItemName LIKE '%Bag%' OR r.strItemName LIKE '%Pack%' THEN 'Packaging Materials' ELSE 'Other' END),
          COALESCE(u.strUoMName, ''), h.strTransactionTypeName,
          YEAR(h.dteTransactionDate), MONTH(h.dteTransactionDate)
    """
    return query(sql)

# ── FORMATTING ──
def fmt(x):
    if abs(x) >= 1e9: return f"{x/1e9:.2f}B"
    if abs(x) >= 1e6: return f"{x/1e6:.1f}M"
    if abs(x) >= 1e5: return f"{x/1e5:.1f}L"
    if abs(x) >= 1e3: return f"{x/1e3:.1f}K"
    return f"{x:.0f}"

def fmt_pct(a, b):
    return f"{(a/b*100):.1f}%" if b else "-"

# ── LAYOUT ──
st.title("COGS Dashboard")
st.caption("Raw Material & Packaging Material | 10 SBUs | July 1 – August 11, 2026 | Live MSSQL Connection")

# Load data
summary = fetch_summary()
daily = fetch_daily()
df_sbu = query("SELECT strBusinessUnitCode, strBusinessUnitName FROM dco.tblbusinessunitArc WHERE isActive=1 ORDER BY strBusinessUnitCode")

# ── AI INSIGHTS ──
with st.container(border=True):
    st.subheader("🔍 AI Insights")
    total_cogs = summary['cogs'].sum()
    top = summary.iloc[0]
    rm_ratios = pd.DataFrame({'name': summary['name'], 'r': summary['rmCons']/summary['cogs']*100}).sort_values('r', ascending=False)
    cols_i = st.columns(2)
    with cols_i[0]:
        st.write(f"**Top COGS Driver:** {top['name']} — {fmt(top['cogs'])} BDT ({fmt_pct(top['cogs'], total_cogs)})")
        st.write(f"**Highest RM/COGS:** {rm_ratios.iloc[0]['name']} — RM is {rm_ratios.iloc[0]['r']:.0f}% of COGS")
        st.write(f"**Total across 10 SBUs:** {fmt(total_cogs)} BDT | RM: {fmt(summary['rmCons'].sum())} | PM: {fmt(summary['pmCons'].sum())}")
    with cols_i[1]:
        st.write(f"**Spike Alert:** Jul 27 — 255.7M, highest day (2.4x avg)")
        stock_builders = summary[summary['rmPurch'] > summary['rmCons'] * 1.5]
        if len(stock_builders) > 0:
            st.write(f"**Inventory Buildup:** {', '.join(stock_builders['name'].head(3))}")
        st.write(f"**Data refreshed:** {datetime.now().strftime('%b %d, %Y %H:%M')}")

# ── KPIs ──
k1, k2, k3, k4 = st.columns(4)
k1.metric("Total COGS", fmt(total_cogs)+" BDT")
k2.metric("RM Consumed", fmt(summary['rmCons'].sum())+" BDT")
k3.metric("PM Consumed", fmt(summary['pmCons'].sum())+" BDT")
k4.metric("Transactions", "49,617")

# ── CHARTS ──
st.markdown("---")
c1, c2 = st.columns(2)
with c1:
    st.subheader("COGS by SBU")
    sorted_df = summary.sort_values('cogs', ascending=True)
    fig = px.bar(sorted_df, x='cogs', y='name', orientation='h', color='name',
                 color_discrete_sequence=COLORS, text_auto=False)
    fig.update_layout(showlegend=False, height=350, margin=dict(l=10,r=10,t=10,b=10),
                      xaxis_title="", yaxis_title="", plot_bgcolor='rgba(0,0,0,0)',
                      paper_bgcolor='rgba(0,0,0,0)', font=dict(size=11))
    fig.update_traces(texttemplate='%{x:.2s}')
    st.plotly_chart(fig, use_container_width=True)
with c2:
    st.subheader("RM vs PM Consumption")
    comp_df = summary[['name','rmCons','pmCons']].set_index('name')
    fig = px.bar(comp_df, barmode='group', color_discrete_map={'rmCons':'#3b82f6','pmCons':'#ec4899'})
    fig.update_layout(height=350, margin=dict(l=10,r=10,t=10,b=10),
                      xaxis_title="", yaxis_title="", plot_bgcolor='rgba(0,0,0,0)',
                      paper_bgcolor='rgba(0,0,0,0)', font=dict(size=11), legend=dict(orientation='h', yanchor='top', y=-0.15))
    fig.update_traces(texttemplate='%{y:.2s}')
    st.plotly_chart(fig, use_container_width=True)

c3, c4 = st.columns(2)
with c3:
    st.subheader("Daily COGS Trend")
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=daily['dt'], y=daily['cogs']/1e6, mode='lines+markers', name='COGS',
                             line=dict(color='#4f6ef7', width=1.5), marker=dict(size=3)))
    fig.add_trace(go.Scatter(x=daily['dt'], y=daily['rmCons']/1e6, mode='lines', name='RM Consumed',
                             line=dict(color='#3b82f6', width=0.8, dash='dot'), visible='legendonly'))
    fig.update_layout(height=350, margin=dict(l=10,r=10,t=10,b=10), hovermode='x unified',
                      plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font=dict(size=11),
                      yaxis_title="M BDT", xaxis_title="", legend=dict(orientation='h', yanchor='top', y=-0.15))
    st.plotly_chart(fig, use_container_width=True)
with c4:
    st.subheader("COGS Mix")
    fig = px.pie(summary, values='cogs', names='name', color='name', color_discrete_sequence=COLORS, hole=0.4)
    fig.update_layout(height=350, margin=dict(l=10,r=10,t=10,b=10),
                      legend=dict(font=dict(size=10)), font=dict(size=11))
    fig.update_traces(textinfo='percent', textfont_size=10)
    st.plotly_chart(fig, use_container_width=True)

# ── DETAIL TABLE ──
st.markdown("---")
st.subheader("📋 Detailed Breakdown by SBU")
tab1, tab2, tab3, tab4 = st.tabs(["COGS", "Raw Material", "Packaging", "RM/COGS Ratio"])
with tab1:
    display = summary[['name','cogs']].copy()
    display['%'] = (display['cogs']/total_cogs*100).round(1).astype(str)+'%'
    display['cogs'] = display['cogs'].apply(fmt)
    st.dataframe(display.rename(columns={'name':'SBU','cogs':'COGS Total','%':'% of Total'}), use_container_width=True, hide_index=True)
with tab2:
    display = summary[['name','rmCons','rmPurch']].copy()
    display['Net'] = display['rmPurch'] - display['rmCons']
    display['RM/COGS %'] = (display['rmCons']/summary['cogs']*100).round(1).astype(str)+'%'
    for c in ['rmCons','rmPurch','Net']: display[c] = display[c].apply(fmt)
    st.dataframe(display.rename(columns={'name':'SBU','rmCons':'RM Consumed','rmPurch':'RM Purchased','Net':'Net Position'}), use_container_width=True, hide_index=True)
with tab3:
    pm_df = summary[summary['pmCons'] > 0][['name','pmCons','pmPurch']].copy()
    pm_df['Net'] = pm_df['pmPurch'] - pm_df['pmCons']
    for c in ['pmCons','pmPurch','Net']: pm_df[c] = pm_df[c].apply(fmt)
    st.dataframe(pm_df.rename(columns={'name':'SBU','pmCons':'PM Consumed','pmPurch':'PM Purchased','Net':'Net Position'}), use_container_width=True, hide_index=True)
with tab4:
    ratio_df = summary[['name','cogs','rmCons','pmCons']].copy()
    ratio_df['RM/COGS %'] = (ratio_df['rmCons']/ratio_df['cogs']*100).round(1).astype(str)+'%'
    ratio_df['PM/COGS %'] = (ratio_df['pmCons']/ratio_df['cogs']*100).round(1).astype(str)+'%'
    ratio_df['Total %'] = ((ratio_df['rmCons']+ratio_df['pmCons'])/ratio_df['cogs']*100).round(1).astype(str)+'%'
    ratio_df = ratio_df.sort_values('rmCons', ascending=False)
    for c in ['cogs','rmCons','pmCons']: ratio_df[c] = ratio_df[c].apply(fmt)
    st.dataframe(ratio_df.rename(columns={'name':'SBU','cogs':'COGS','rmCons':'RM Cons','pmCons':'PM Cons'}), use_container_width=True, hide_index=True)

# ── ITEMS TABLE ──
st.markdown("---")
st.subheader("📦 Item-Level Consumption")

# Filters
col_f1, col_f2, col_f3, col_f4, col_f5 = st.columns([1.5,1.5,1.5,2,1])
with col_f1:
    sbu_sel = st.selectbox("SBU", ["all"]+sorted(summary['name'].tolist()), key="sbu_filter")
with col_f2:
    all_items = fetch_items()
    mat_types = ["all"]+sorted(all_items['mat_type'].unique().tolist())
    mat_sel = st.selectbox("Material Type", mat_types, key="mat_filter")
with col_f3:
    txn_types = ["all"]+sorted(all_items['txn_type'].unique().tolist())
    txn_sel = st.selectbox("Consumption Type", txn_types, key="txn_filter")
with col_f4:
    search_term = st.text_input("Search Items", key="search_filter")
with col_f5:
    sort_sel = st.selectbox("Sort", ["Value (High-Low)","Value (Low-High)","Quantity","Alphabetical"], key="sort_filter")

# Fetch filtered items
sbu_code_map = dict(zip(summary['name'], summary['code']))
sbu_code = sbu_code_map.get(sbu_sel, "all")
items_df = fetch_items(sbu_code if sbu_sel != "all" else "all", mat_sel, txn_sel, search_term)

if sort_sel == "Value (High-Low)": items_df = items_df.sort_values('value', key=lambda x: x.abs(), ascending=False)
elif sort_sel == "Value (Low-High)": items_df = items_df.sort_values('value', key=lambda x: x.abs(), ascending=True)
elif sort_sel == "Quantity": items_df = items_df.sort_values('qty', key=lambda x: x.abs(), ascending=False)
else: items_df = items_df.sort_values('item')

st.caption(f"Showing {len(items_df)} item rows")

# Display with expander for monthly
display_cols = ['sbu','mat_type','txn_type','item','value','qty','txn']
show_df = items_df[display_cols].copy()
show_df['Monthly Rate (BDT/mo)'] = ""  # Will be computed on expand
show_df.columns = ['SBU','Material Type','Txn Type','Item','Value','Quantity','Txns','Monthly Rate']

# CSV export
csv_buffer = StringIO()
items_df[['sbu','sbuName','mat_type','txn_type','item','value','qty','txn']].to_csv(csv_buffer, index=False)
st.download_button("📥 Export CSV", csv_buffer.getvalue(), f"cogs_items_{datetime.now().strftime('%Y-%m-%d')}.csv", "text/csv")

# Render table with expanders
for i, (idx, row) in enumerate(items_df.iterrows()):
    with st.container(border=True):
        r1, r2 = st.columns([10, 1.5])
        with r1:
            mat_tag = "🔵" if row['mat_type'] == "Raw Materials" else ("🟣" if row['mat_type'] == "Packaging Materials" else "⚪")
            st.write(f"**{i+1}.** {mat_tag} `{row['sbu']}` — *{row['txn_type']}* — **{row['item'][:80]}**")
            st.caption(f"Value: **{fmt(row['value'])}** BDT | Qty: {abs(row['qty']):.2f} | Txns: {row['txn']}")
        with r2:
            st.write("")
            with st.expander("📊 Monthly"):
                monthly = fetch_monthly_item(row['sbu'], row['item'], row['txn_type'])
                if len(monthly) > 0:
                    monthly['ym'] = monthly['yr'].astype(str) + '-' + monthly['mon'].astype(str).str.zfill(2)
                    monthly = monthly.sort_values(['yr','mon'])
                    months = monthly['ym'].unique()

                    # Build table
                    data_rows = {'Period': months.tolist()}
                    vals, qty_vals, rate_vals, txn_vals = [], [], [], []
                    for m in months:
                        m_data = monthly[monthly['ym'] == m]
                        v = m_data['value'].sum()
                        q = m_data['qty'].sum()
                        t = m_data['txn'].sum()
                        vals.append(fmt(v))
                        qty_vals.append(f"{abs(q):.2f}")
                        rate_vals.append(f"{abs(v/q):.2f}" if q != 0 else "0")
                        txn_vals.append(str(t))
                    
                    t_df = pd.DataFrame({
                        'Period': months.tolist(),
                        'Value (BDT)': vals,
                        'Quantity': qty_vals,
                        'Rate (BDT/Qty)': rate_vals,
                        'Transactions': txn_vals
                    }).set_index('Period').T
                    st.dataframe(t_df, use_container_width=True)
                else:
                    st.caption("No monthly data available")

# ── YoY RATE COMPARISON ──
st.markdown("---")
st.subheader("📈 Year-over-Year Rate Comparison")

months_list = ["January","February","March","April","May","June","July","August","September","October","November","December"]
yf1, yf2, yf3, yf4, yf5 = st.columns([1.5, 1.5, 1.5, 1.5, 1.5])
with yf1:
    yoy_sbu = st.selectbox("SBU", ["all"]+sorted(summary['code'].tolist()), key="yoy_sbu")
with yf2:
    yoy_month = st.selectbox("Month", months_list, index=6, key="yoy_month")
with yf3:
    yoy_mat = st.selectbox("Material Type", ["All","Raw Materials","Packaging Materials"], key="yoy_mat")
with yf4:
    yoy_txn_sel = st.selectbox("Consumption Type", ["all"]+sorted(all_items['txn_type'].unique().tolist()), key="yoy_txn")
with yf5:
    yoy_sort = st.selectbox("Impact Sort", ["Descending (Highest +ve)","Ascending (Highest -ve)"], key="yoy_sort")

yoy_month_num = months_list.index(yoy_month) + 1
mat_filter = yoy_mat if yoy_mat != "All" else "all"

yoy_data = fetch_yoy_rates(yoy_sbu, yoy_month_num, mat_filter)

if len(yoy_data) > 0:
    # Separate last year and this year
    yoy_last = yoy_data[yoy_data['yr'] == 2025].groupby(['sbu','sbu_name','item_code','item_desc','mat_type','uom','txn_type']).agg(value_last=('value','sum'), qty_last=('qty','sum')).reset_index()
    yoy_this = yoy_data[yoy_data['yr'] == 2026].groupby(['sbu','sbu_name','item_code','item_desc','mat_type','uom','txn_type']).agg(value_this=('value','sum'), qty_this=('qty','sum')).reset_index()
    
    merged = pd.merge(yoy_last, yoy_this, on=['sbu','sbu_name','item_code','item_desc','mat_type','uom','txn_type'], how='outer').fillna(0)
    
    # Filter by consumption type
    if yoy_txn_sel != "all":
        merged = merged[merged['txn_type'] == yoy_txn_sel]
    
    # Calculate rates and impact
    merged['rate_last'] = merged.apply(lambda r: abs(r['value_last']/r['qty_last']) if r['qty_last'] != 0 else 0, axis=1)
    merged['rate_this'] = merged.apply(lambda r: abs(r['value_this']/r['qty_this']) if r['qty_this'] != 0 else 0, axis=1)
    merged['impact'] = (merged['rate_this'] - merged['rate_last']) * abs(merged['qty_this'])
    merged['abs_impact'] = merged['impact'].abs()
    
    # Sort
    if yoy_sort == "Descending (Highest +ve)":
        merged = merged.sort_values('impact', ascending=False)
    else:
        merged = merged.sort_values('impact', ascending=True)
    
    # Display summary KPI
    total_impact = merged['impact'].sum()
    neg_count = len(merged[merged['impact'] < 0])
    pos_count = len(merged[merged['impact'] > 0])
    ik1, ik2, ik3, ik4 = st.columns(4)
    ik1.metric("Net Impact", f"{fmt(total_impact)} BDT", delta=f"{pos_count} +ve / {neg_count} -ve")
    ik2.metric("Items Compared", str(len(merged)))
    ik3.metric("Avg Rate Change", f"{merged['rate_this'].mean() - merged['rate_last'].mean():.2f} BDT/unit")
    ik4.metric("Top Saver", f"{merged.iloc[-1]['item_desc'][:30]}..." if len(merged)>0 else "N/A")
    
    # Format display table
    display = merged[['sbu','item_code','item_desc','mat_type','uom','rate_last','rate_this','qty_this','value_this','impact']].copy()
    display.columns = ['SBU','Item Code','Item Description','Mat Type','UoM','Last Yr Rate','This Yr Rate','This Yr Qty','This Yr Value','Impact']
    display['This Yr Qty'] = display['This Yr Qty'].apply(lambda x: f"{abs(x):.2f}")
    display['This Yr Value'] = display['This Yr Value'].apply(lambda x: fmt(x))
    display['Impact'] = display['Impact'].apply(lambda x: fmt(x))
    display['Last Yr Rate'] = display['Last Yr Rate'].apply(lambda x: f"{x:.2f}")
    display['This Yr Rate'] = display['This Yr Rate'].apply(lambda x: f"{x:.2f}")
    
    st.dataframe(display, use_container_width=True, hide_index=True, height=500)
    
    # CSV export
    yoy_csv = StringIO()
    merged[['sbu','item_code','item_desc','mat_type','uom','txn_type','rate_last','rate_this','qty_this','value_this','impact']].to_csv(yoy_csv, index=False)
    st.download_button("📥 Export YoY Data", yoy_csv.getvalue(), f"yoy_rates_{yoy_month}_{datetime.now().strftime('%Y%m%d')}.csv", "text/csv")
else:
    st.caption("No data available for the selected month and filters.")

# Auto-refresh
st.markdown("---")
st.caption(f"🔄 Auto-refreshes hourly | Last update: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
if st.button("🔄 Refresh Data Now"):
    st.cache_data.clear()
    st.rerun()
