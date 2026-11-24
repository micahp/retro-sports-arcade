param([int]$LenRights, [int]$PenRights, [string]$Name, [int]$Delay = 0)
# From setup.state: set period length and penalties, put both pads on CPU, start, save at puck drop.
$nav = @("load E:/emu/work/setup.state", "wait 10")
$nav += (1..3 | % { "press Down 10", "wait 15" })
for ($i = 0; $i -lt $LenRights; $i++) { $nav += "press Right 10", "wait 20" }
$nav += (1..3 | % { "press Down 10", "wait 15" })
for ($i = 0; $i -lt $PenRights; $i++) { $nav += "press Right 10", "wait 20" }
$nav += "wait 10", "shot E:/emu/work/st-$Name-menu.png"
$nav += "press Start 20", "wait 120", "press Left 10", "wait 30", "shot E:/emu/work/st-$Name-ctrl.png"
if ($Delay -gt 0) { $nav += "wait $Delay" }
$nav += "press Start 20", "wait 300", "press Start 20", "wait 200", "press C 10", "wait 120"
$nav += "save E:/emu/work/pd-$Name.state", "shot E:/emu/work/st-$Name-play.png"
& E:\emu\work\cmd.ps1 @nav -Timeout 120
