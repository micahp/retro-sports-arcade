# Phase C: per config one base puck-drop state, 10 recorded RNG seeds, N emulators in parallel.
param([int]$Workers = 5, [int]$Games = 10, [string]$Tag = 'C3')
Get-Process EmuHawk -ErrorAction SilentlyContinue | Stop-Process -Force
$dir = "E:\emu\work\runs\$Tag"; New-Item -ItemType Directory -Force $dir | Out-Null
$queue = [System.Collections.Queue]::new()
foreach ($c in '5-pen', '10-pen', '20-pen') {
  for ($k = 1; $k -le $Games; $k++) {
    $seed = [uint32](([uint64]$k * 2654435761) % 4294967296)   # Knuth multiplicative hash of k: spread-out seeds
    $queue.Enqueue(@{ g = "$c-s$k"; state = "pd-$c-d7"; seed = $seed })
  }
}
$running = @{}; $t0 = Get-Date
"start $(Get-Date -Format s), $($queue.Count) games, $Workers workers"
while ($queue.Count -gt 0 -or $running.Count -gt 0) {
  foreach ($k in @($running.Keys)) { if ($running[$k].HasExited) { "$k done at $([int]((Get-Date) - $t0).TotalSeconds) s"; $running.Remove($k) } }
  while ($running.Count -lt $Workers -and $queue.Count -gt 0) {
    $j = $queue.Dequeue()
    Remove-Item "$dir\$($j.g).jsonl" -ErrorAction SilentlyContinue
    $env:NHL95_RUN = "$Tag/$($j.g)"; $env:NHL95_GAMES = '1'; $env:NHL95_STATE = "E:/emu/work/$($j.state).state"; $env:NHL95_SEED = "$($j.seed)"
    $running[$j.g] = Start-Process E:\emu\bizhawk\EmuHawk.exe -ArgumentList '--lua=E:\emu\work\record.lua', '"E:\emu\roms\NHL 95 (USA, Europe).md"' -WorkingDirectory E:\emu\bizhawk -PassThru -WindowStyle Minimized
    Start-Sleep 3
  }
  Start-Sleep 5
}
"done $(Get-Date -Format s) in $([int]((Get-Date) - $t0).TotalSeconds) s"
