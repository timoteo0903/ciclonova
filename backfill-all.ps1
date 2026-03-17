param(
  [string]$BaseUrl   = "http://localhost:3000",
  [string]$From      = "2025-01-01",
  [string]$To        = (Get-Date -Format "yyyy-MM-dd"),
  [int]   $FundId    = 0,
  [int]   $ChunkDays = 45,
  [string]$Secret    = ""
)

$ErrorActionPreference = "Stop"

$chunks = @()
$cur = [datetime]::ParseExact($From, "yyyy-MM-dd", $null)
$end = [datetime]::ParseExact($To,   "yyyy-MM-dd", $null)

while ($cur -le $end) {
  $chunkEnd = $cur.AddDays($ChunkDays - 1)
  if ($chunkEnd -gt $end) { $chunkEnd = $end }
  $chunks += @{ from = $cur.ToString("yyyy-MM-dd"); to = $chunkEnd.ToString("yyyy-MM-dd") }
  $cur = $chunkEnd.AddDays(1)
}

Write-Host "Backfill: $($chunks.Count) chunks de ~$ChunkDays dias"
Write-Host "Rango total: $From -> $To"
if ($FundId -gt 0) { Write-Host "Solo fondo: $FundId" }
Write-Host ""

$headers = @{ "Content-Type" = "application/json" }
if ($Secret) { $headers["x-refresh-secret"] = $Secret }

$totalUpserted = 0
$totalSkipped  = 0
$errors        = @()

for ($i = 0; $i -lt $chunks.Count; $i++) {
  $chunk = $chunks[$i]
  $label = "[$($i+1)/$($chunks.Count)] $($chunk.from) -> $($chunk.to)"
  Write-Host -NoNewline "$label ... "

  $body = @{ from = $chunk.from; to = $chunk.to }
  if ($FundId -gt 0) { $body["fundId"] = $FundId }

  try {
    $resp = Invoke-RestMethod `
      -Uri        "$BaseUrl/api/fondos/backfill" `
      -Method     POST `
      -Headers    $headers `
      -Body       ($body | ConvertTo-Json) `
      -TimeoutSec 600

    $totalUpserted += $resp.totalUpserted
    $totalSkipped  += $resp.totalSkipped
    Write-Host "OK - upserted: $($resp.totalUpserted), skipped: $($resp.totalSkipped)"

    if ($resp.errors) {
      foreach ($e in $resp.errors) {
        Write-Host "  WARN: $e" -ForegroundColor Yellow
        $errors += $e
      }
    }
  }
  catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $errors += "$label : $_"
  }

  if ($i -lt $chunks.Count - 1) { Start-Sleep -Seconds 3 }
}

Write-Host ""
Write-Host "----------------------------------------"
Write-Host "BACKFILL COMPLETADO"
Write-Host "  Total upserted : $totalUpserted"
Write-Host "  Total skipped  : $totalSkipped"
Write-Host "  Errores        : $($errors.Count)"
if ($errors.Count -gt 0) {
  Write-Host "Detalle errores:"
  foreach ($e in $errors) { Write-Host "  - $e" -ForegroundColor Yellow }
}
Write-Host "----------------------------------------"
