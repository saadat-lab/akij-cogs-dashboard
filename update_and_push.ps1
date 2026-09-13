Set-Location -LiteralPath "C:\Users\saada\OneDrive\Documents\Default Project"
$env:Path += ";C:\Program Files\Git\cmd;C:\Program Files\nodejs"
$log = "C:\Users\saada\OneDrive\Documents\Default Project\logs\update_$(Get-Date -Format yyyyMMdd_HHmm).log"
New-Item -ItemType Directory -Force -Path "C:\Users\saada\OneDrive\Documents\Default Project\logs" | Out-Null
function log($m){ $ts=Get-Date -Format "yyyy-MM-dd HH:mm:ss"; "$ts $m" | Tee-Object -FilePath $log -Append | Write-Output }
log "=== Auto update started ==="
try {
  log "Running refresh_cogs.js..."
  node refresh_cogs.js 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  log "Running fetch_yoy.js..."
  node fetch_yoy.js 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  log "Running fetch_slob_aafl.js..."
  node fetch_slob_aafl.js 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  log "Running fetch_slob_hrml.js..."
  node fetch_slob_hrml.js 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  log "Running fetch_slob_fal.js..."
  node fetch_slob_fal.js 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  log "Running fetch_slob_ibos_aafl.js..."
  node fetch_slob_ibos_aafl.js 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  log "Running fetch_slob_ibos_hrml.js..."
  node fetch_slob_ibos_hrml.js 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  log "Running fetch_slob_ibos_fal.js..."
  node fetch_slob_ibos_fal.js 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  # keep index.html in sync
  Copy-Item -LiteralPath "cogs_dashboard.html" -Destination "index.html" -Force
  log "Copy cogs_dashboard.html -> index.html"
  # git add only dashboard assets (not inspect/debug scripts)
  git add cogs_dashboard.html index.html slob_aafl.js slob_hrml.js slob_fal.js slob_ibos_aafl.js slob_ibos_hrml.js slob_ibos_fal.js yoy_data.js items_data.js monthly_items.js daily_items.js slob_data.js 2>&1 | Out-String | Write-Output
  $status = git status --porcelain 2>&1 | Out-String
  if ($status.Trim() -eq "") { log "No changes to commit."; exit 0 }
  $msg = "Daily auto-refresh $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  git commit -m $msg 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  git push origin main 2>&1 | Tee-Object -FilePath $log -Append | Out-String | Write-Output
  log "Push done."
} catch {
  log "ERROR: $($_.Exception.Message)"
  exit 1
}
log "=== Done ==="
