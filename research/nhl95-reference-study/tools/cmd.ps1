param([Parameter(ValueFromRemainingArguments)][string[]]$Lines, [int]$Timeout = 300)
$W = "E:\emu\work"
Remove-Item "$W\done.txt" -ErrorAction SilentlyContinue
Set-Content -Path "$W\cmd.tmp" -Value ($Lines -join "`n") -Encoding ascii
Move-Item "$W\cmd.tmp" "$W\cmd.txt" -Force
$t = 0
while (-not (Test-Path "$W\done.txt") -and $t -lt $Timeout * 10) { Start-Sleep -Milliseconds 100; $t++ }
if (Test-Path "$W\done.txt") { Get-Content "$W\done.txt" | Select-Object -First 1 } else { "TIMEOUT" }
