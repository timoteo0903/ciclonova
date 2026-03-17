$BASE = "http://localhost:3000"
$TIMEOUT = 600

$chunks = @(
  @{ from = "2025-06-30"; to = "2025-08-13" },
  @{ from = "2025-12-27"; to = "2026-02-09" },
  @{ from = "2026-02-10"; to = "2026-03-16" }
)

$i = 0
foreach ($chunk in $chunks) {
  $i++
  Write-Host "[$i/3] $($chunk.from) -> $($chunk.to) ..." -NoNewline
  try {
    $body = @{ from = $chunk.from; to = $chunk.to } | ConvertTo-Json
    $res  = Invoke-RestMethod `
              -Uri "$BASE/api/fondos/backfill" `
              -Method POST `
              -Body $body `
              -ContentType "application/json" `
              -TimeoutSec $TIMEOUT
    Write-Host " OK - upserted: $($res.totalUpserted), skipped: $($res.totalSkipped)"
    if ($res.errors) { $res.errors | ForEach-Object { Write-Host "  WARN: $_" -ForegroundColor Yellow } }
  } catch {
    Write-Host " ERROR: $_" -ForegroundColor Red
  }
}

Write-Host "Listo."
