# backfill.ps1 — Rellena cafci_vcp_diario y cafci_ficha_snapshot en Supabase
#
# Uso:
#   .\backfill.ps1
#   .\backfill.ps1 -Start "2025-06-01"
#   .\backfill.ps1 -Start "2025-01-01" -ChunkDays 7
#   .\backfill.ps1 -Start "2026-03-01" -End "2026-03-15"   # rango puntual
#
# La función ETL no requiere JWT (verify_jwt = false en supabase/config.toml).

param(
  [string]$Start     = "2025-08-31",
  [string]$End       = "",           # vacío = ayer Argentina
  [int]   $ChunkDays = 5,
  [string]$BaseUrl   = "https://wfgrttqjcjkorhcvqtva.supabase.co/functions/v1/etl-cafci",
  [string]$Token     = ""            # Bearer token, si en algún momento se habilita JWT
)

# ─── Calcular fecha fin ───────────────────────────────────────────────────────

$argNow = [DateTime]::UtcNow.AddHours(-3)   # hora Argentina (UTC-3)
$endDate = if ($End) { [datetime]$End } else { $argNow.AddDays(-1).Date }

$startDate = [datetime]$Start

if ($startDate -gt $endDate) {
  Write-Host "ERROR: -Start es posterior al fin ($($endDate.ToString('yyyy-MM-dd')))." -ForegroundColor Red
  exit 1
}

# ─── Resumen inicial ──────────────────────────────────────────────────────────

$totalDays   = [int]($endDate - $startDate).TotalDays + 1
$totalChunks = [int][Math]::Ceiling($totalDays / $ChunkDays)

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Backfill CAFCI → Supabase" -ForegroundColor Cyan
Write-Host "  Rango   : $($startDate.ToString('yyyy-MM-dd'))  →  $($endDate.ToString('yyyy-MM-dd'))" -ForegroundColor Cyan
Write-Host "  Días    : $totalDays   |   Chunks de $ChunkDays días   |   Total chunks: $totalChunks" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ─── Loop de chunks ───────────────────────────────────────────────────────────

$cur        = $startDate
$chunkNum   = 0
$totalRows  = 0
$totalUps   = 0
$errChunks  = 0

while ($cur -le $endDate) {
  $from   = $cur.ToString("yyyy-MM-dd")
  $toDate = $cur.AddDays($ChunkDays - 1)
  if ($toDate -gt $endDate) { $toDate = $endDate }
  $to = $toDate.ToString("yyyy-MM-dd")

  $chunkNum++
  $pct = [int](($chunkNum / $totalChunks) * 100)
  Write-Host "[$chunkNum/$totalChunks  $pct%]  $from → $to  ..." -NoNewline

  $url     = "${BaseUrl}?date_from=${from}&date_to=${to}"
  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }

  try {
    $res     = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 180
    $rows    = $res.totalRows
    $ups     = $res.totalUpserted
    $empty   = $res.datesEmpty
    $fichas  = if ($null -ne $res.fichasUpserted) { $res.fichasUpserted } else { "-" }

    $totalRows += $rows
    $totalUps  += $ups

    Write-Host "  OK  rows=$rows  upserted=$ups  empty=$empty  fichas=$fichas" -ForegroundColor Green

    if ($res.errors -and $res.errors.Count -gt 0) {
      foreach ($e in $res.errors) {
        Write-Host "    ⚠  $e" -ForegroundColor Yellow
      }
    }
  } catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    $errChunks++
  }

  $cur = $cur.AddDays($ChunkDays)
  Start-Sleep -Seconds 2
}

# ─── Resumen final ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Backfill finalizado" -ForegroundColor Cyan
Write-Host "  Chunks OK  : $($chunkNum - $errChunks) / $chunkNum" -ForegroundColor Cyan
Write-Host "  Filas CAFCI: $totalRows   |   Filas upserted: $totalUps" -ForegroundColor Cyan
if ($errChunks -gt 0) {
  Write-Host "  Chunks con error: $errChunks  (revisalos arriba y reejecutalos con -Start/-End)" -ForegroundColor Yellow
}
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
