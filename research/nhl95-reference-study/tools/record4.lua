-- NHL 95 recorder v4 (v3 + goal lines: scoring team and PP flag read from the team blocks)
-- NHL 95 recorder v3: RAM sampling (v2) + execute hooks on game routines for exact events.
-- ROM addresses from NHL95Genesis docs/function_origins.csv (retail ROM, SHA-1 09e87b07...).
-- Hook events ("ev" lines), each with frame, period, clock, puck x/y:
--   call   AddPenalty / AddPenalty2: whistle or penalty code (low byte of D0); repeats of the same code
--          within 30 frames are collapsed (offside is re-reported every frame while pending)
--   shot   doshot: shooter (A3 object index), puck z      pass  dopass: passer
--   ot     onetimershot: shooter                           glue  puckglue: player taking the puck (goalie = hold)
--   gcon   puckgoalie: goalie contact, puck velocity       fall  FallDown: A2 falls, A3 hitter
--   gsave  goaliesave: goalie picks a save
-- RAM lines as v2: traj (10 Hz), clock (1 Hz), poss, stop (with the last whistle code), drop, man (manpower change), gsp, final.
local OUT = "E:/emu/work/runs/" .. (os.getenv("NHL95_RUN") or "run") .. ".jsonl"
local MAXGAMES = tonumber(os.getenv("NHL95_GAMES") or "1")
local D = "68K RAM"
local function rw(a) return memory.read_u16_be(a & 0xFFFF, D) end
local function rs(a) return memory.read_s16_be(a & 0xFFFF, D) end
local function rb(a) return memory.read_u8(a & 0xFFFF, D) end
local HOME, AWAY, SC, PUCK = 0xFFFFC288, 0xFFFFC5EE, 0xFFFFAC62, 0xFFFFB362
local function team(base)
  return string.format('{"shots":%d,"ppGoals":%d,"pp":%d,"pen":%d,"pim":%d,"atop":%d,"score":%d}',
    rw(base), rw(base + 2), rw(base + 4), rw(base + 6), rw(base + 8), rw(base + 0xA), rw(base + 0xC))
end
local function bytes(base, n) local t = {}; for i = 0, n - 1 do t[#t + 1] = rb(base + i) end; return "[" .. table.concat(t, ",") .. "]" end
client.SetSoundOn(false)
if os.getenv("NHL95_STATE") then savestate.load(os.getenv("NHL95_STATE")) end
local SEED = os.getenv("NHL95_SEED")
local seedBefore = memory.read_u32_be(0xCC6A, D)
if SEED then memory.write_u32_be(0xCC6A, tonumber(SEED), D) end
pcall(function() emu.limitframerate(false) end)
pcall(function() client.speedmode(6400) end)
local f = io.open(OUT, "a")
local function put(s) f:write(s .. "\n") end
put(string.format('{"type":"start","frame":%d,"perTimeTotal":%d,"state":"%s","seedBefore":%d,"seed":%d,"recorder":4}', emu.framecount(), rw(0xFFFFC026), os.getenv("NHL95_STATE") or "", seedBefore, memory.read_u32_be(0xCC6A, D)))

local function obj(reg) local a = emu.getregister(reg) & 0xFFFF; return math.floor((a - (SC & 0xFFFF)) / 128) end
local function ev(kind, extra)
  put(string.format('{"type":"ev","ev":"%s","frame":%d,"gsp":%d,"clock":%d,"x":%d,"y":%d%s}', kind, emu.framecount(), rw(0xFFFFC020), rw(0xFFFFC022), rs(PUCK), rs(PUCK + 0x14), extra or ""))
end
local lastCall, lastCallFrame, lastWhistle = -1, -999, -1
local function call(which)
  local code = emu.getregister("M68K D0") & 0xFF
  lastWhistle = code
  if code == lastCall and emu.framecount() - lastCallFrame < 30 then lastCallFrame = emu.framecount(); return end
  lastCall, lastCallFrame = code, emu.framecount()
  ev("call", string.format(',"fn":%d,"code":%d', which, code))
end
event.onmemoryexecute(function() call(1) end, 0x089140, "AddPenalty")
event.onmemoryexecute(function() call(2) end, 0x08916E, "AddPenalty2")
event.onmemoryexecute(function() ev("shot", string.format(',"by":%d,"z":%d', obj("M68K A3"), rs(PUCK + 0x18))) end, 0x084B6E, "doshot")
event.onmemoryexecute(function() ev("pass", string.format(',"by":%d', obj("M68K A3"))) end, 0x0844F8, "dopass")
event.onmemoryexecute(function() ev("ot", string.format(',"by":%d', obj("M68K A3"))) end, 0x082EFE, "onetimershot")
event.onmemoryexecute(function() ev("glue", string.format(',"by":%d', obj("M68K A2"))) end, 0x07BAB2, "puckglue")
event.onmemoryexecute(function() ev("gcon", string.format(',"g":%d,"vx":%d,"vy":%d,"z":%d', obj("M68K A2"), rs(0xFFFFB38A), rs(0xFFFFB38C), rs(PUCK + 0x18))) end, 0x07C154, "puckgoalie")
event.onmemoryexecute(function() ev("fall", string.format(',"who":%d,"by":%d', obj("M68K A2"), obj("M68K A3"))) end, 0x07B09A, "FallDown")
event.onmemoryexecute(function() ev("gsave", string.format(',"g":%d', obj("M68K A3"))) end, 0x080478, "goaliesave")
-- v4: goal routine entry (Goal, $08C304). The scoring team is read from the team blocks ~30 frames later:
-- whichever score word rose, and whether its PP-goal counter rose too. Written as "goal" lines.
local pendingGoal = nil
event.onmemoryexecute(function()
  if pendingGoal then return end
  pendingGoal = { frame = emu.framecount(), gsp = rw(0xFFFFC020), clock = rw(0xFFFFC022), x = rs(PUCK), y = rs(PUCK + 0x14),
    hs = rw(HOME + 0xC), as = rw(AWAY + 0xC), hpp = rw(HOME + 0x2), app = rw(AWAY + 0x2),
    hAp = rw(HOME + 0x24), aAp = rw(AWAY + 0x24) }
end, 0x08C304, "Goal")

local games, lastGsp, startFrame = 0, rw(0xFFFFC020), emu.framecount()
local lastPc, lastStopped = rs(0xFFFFB3C2), (rb(0xFFFFBEF0) & 1)
local lastMan = rw(HOME + 0x24) * 16 + rw(AWAY + 0x24)
while games < MAXGAMES do
  emu.frameadvance()
  local fc = emu.framecount()
  local gsp = rw(0xFFFFC020)
  local px, py = rs(PUCK), rs(PUCK + 0x14)
  local pc = rs(0xFFFFB3C2)
  if fc % 6 == 0 then
    local t = { fc, px, py }
    for i = 0, 11 do local o = SC + i * 128; t[#t + 1] = rs(o); t[#t + 1] = rs(o + 0x14) end
    put('{"type":"traj","v":[' .. table.concat(t, ",") .. ']}')
  end
  if fc % 60 == 0 then
    put(string.format('{"type":"clock","frame":%d,"gsp":%d,"clock":%d,"home":%d,"away":%d,"hmAp":%d,"awAp":%d}',
      fc, gsp, rw(0xFFFFC022), rw(0xFFFFC294), rw(0xFFFFC5FA), rw(HOME + 0x24), rw(AWAY + 0x24)))
  end
  local man = rw(HOME + 0x24) * 16 + rw(AWAY + 0x24)
  if man ~= lastMan then
    put(string.format('{"type":"man","frame":%d,"gsp":%d,"clock":%d,"hmAp":%d,"awAp":%d}', fc, gsp, rw(0xFFFFC022), rw(HOME + 0x24), rw(AWAY + 0x24)))
    lastMan = man
  end
  if pc ~= lastPc then
    put(string.format('{"type":"poss","frame":%d,"gsp":%d,"clock":%d,"from":%d,"to":%d,"x":%d,"y":%d}', fc, gsp, rw(0xFFFFC022), lastPc < 0 and -1 or lastPc, pc < 0 and -1 or pc, px, py))
    lastPc = pc
  end
  local stopped = rb(0xFFFFBEF0) & 1
  if stopped ~= lastStopped then
    if stopped == 1 then
      put(string.format('{"type":"stop","frame":%d,"gsp":%d,"clock":%d,"code":%d,"refPen":%d,"x":%d,"y":%d}', fc, gsp, rw(0xFFFFC022), lastWhistle, rw(0xFFFFC01E), px, py))
    else
      put(string.format('{"type":"drop","frame":%d,"gsp":%d,"clock":%d,"x":%d,"y":%d}', fc, gsp, rw(0xFFFFC022), px, py))
    end
    lastStopped = stopped
  end
  if pendingGoal and fc - pendingGoal.frame >= 30 then
    local p = pendingGoal
    local hs, as = rw(HOME + 0xC), rw(AWAY + 0xC)
    local team = "none"
    if hs > p.hs then team = "home" elseif as > p.as then team = "away" end
    local ppd = (team == "home") and (rw(HOME + 0x2) - p.hpp) or ((team == "away") and (rw(AWAY + 0x2) - p.app) or 0)
    put(string.format('{"type":"goal","frame":%d,"gsp":%d,"clock":%d,"team":"%s","pp":%d,"x":%d,"y":%d,"hAp":%d,"aAp":%d,"scoreDelta":%d}',
      p.frame, p.gsp, p.clock, team, ppd, p.x, p.y, p.hAp, p.aAp, (hs - p.hs) + (as - p.as)))
    pendingGoal = nil
  end
  if gsp ~= lastGsp then
    put(string.format('{"type":"gsp","frame":%d,"from":%d,"to":%d,"home":%s,"away":%s}', fc, lastGsp, gsp, team(HOME), team(AWAY)))
    if gsp == 4 then
      local sb, pl = rw(0xFFFFC02C), rw(0xFFFFC196)
      put(string.format('{"type":"options","optPerlen":%d,"optPen":%d,"optLine":%d,"optGoalie":%d,"team1":%d,"team2":%d}',
        rw(0xFFFFCC54), rw(0xFFFFCC5A), rw(0xFFFFCC5C), rw(0xFFFFCC56), rw(0xFFFFCC50), rw(0xFFFFCC52)))
      put(string.format('{"type":"final","frame":%d,"frames":%d,"perTimeTotal":%d,"home":%s,"away":%s,"scoreSumBytes":%d,"scoreSum":%s,"penSumLength":%d,"penSum":%s}',
        fc, fc - startFrame, rw(0xFFFFC026), team(HOME), team(AWAY), sb, bytes(0xFFFFC02E, math.min(sb, 360)), pl, bytes(0xFFFFC198, math.min(pl, 240))))
      games = games + 1
    end
    if lastGsp == 4 and gsp == 0 then startFrame = fc end
    lastGsp = gsp
  end
end
f:close()
client.exit()
