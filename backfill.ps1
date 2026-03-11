$BASE_URL = "https://uixahwicufntyvalwlha.supabase.co/functions/v1/etl-cafci"
$START    = [datetime]"2025-01-01"
$END      = [datetime]"2026-03-10"
$CHUNK    = 5  # dias por llamada

$cur = $START
while ($cur -le $END) {
    $from    = $cur.ToString("yyyy-MM-dd")
    $toDate  = $cur.AddDays($CHUNK - 1)
    if ($toDate -gt $END) { $toDate = $END }
    $to = $toDate.ToString("yyyy-MM-dd")

    $url = "${BASE_URL}?date_from=${from}&date_to=${to}"
    Write-Host "[$from -> $to] llamando..." -NoNewline

    try {
        $res = Invoke-RestMethod -Uri $url -TimeoutSec 120
        Write-Host " OK  rows=$($res.totalRows) upserted=$($res.totalUpserted) empty=$($res.datesEmpty)"
    } catch {
        Write-Host " ERROR: $_"
    }

    $cur = $cur.AddDays($CHUNK)
    Start-Sleep -Seconds 2
}

Write-Host "Backfill completado."
