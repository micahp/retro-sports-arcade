-- NHL 95 (Genesis) CPU-vs-CPU recorder. Reads RAM only; never presses buttons.
-- Addresses from abdulahmad/NHL95Genesis src/ram95.asm and src/inc/equals.inc (to be verified).
-- Output: one JSON object per line in OUT; "clock" lines sample the game clock once per 60 frames.
local OUT = "E:/emu/work/runs/" .. (os.getenv("NHL95_RUN") or "run") .. ".jsonl"
local MAXGAMES = tonumber(os.getenv("NHL95_GAMES") or "1")
local D = "68K RAM"
-- 68K RAM domain is 64 KB mapped at $FF0000; addresses below are full 24/32-bit, so take the low 16 bits.
local function rw(a) return memory.read_u16_be(a & 0xFFFF, D) end
local function rb(a) return memory.read_u8(a & 0xFFFF, D) end
local HOME, AWAY = 0xFFFFC288, 0xFFFFC5EE
local function team(base)
  return string.format('{"shots":%d,"ppGoals":%d,"pp":%d,"pen":%d,"pim":%d,"atop":%d,"score":%d}',
    rw(base), rw(base + 2), rw(base + 4), rw(base + 6), rw(base + 8), rw(base + 0xA), rw(base + 0xC))
end
local function bytes(base, n)
  local t = {}
  for i = 0, n - 1 do t[#t + 1] = rb(base + i) end
  return "[" .. table.concat(t, ",") .. "]"
end
client.SetSoundOn(false)
if os.getenv("NHL95_STATE") then savestate.load(os.getenv("NHL95_STATE")) end
-- The game's only RNG is a 32-bit LCG at $FFCC6A (randomd0, middle95.asm), seeded once from the
-- hardware HV counter. Writing a recorded seed here is the one intervention; nothing else is touched.
local SEED = os.getenv("NHL95_SEED")
local seedBefore = memory.read_u32_be(0xCC6A, "68K RAM")
if SEED then memory.write_u32_be(0xCC6A, tonumber(SEED), "68K RAM") end
pcall(function() emu.limitframerate(false) end)
pcall(function() client.speedmode(6400) end)
local f = io.open(OUT, "a")
local function put(s) f:write(s .. "\n"); f:flush() end
put(string.format('{"type":"start","frame":%d,"perTimeTotal":%d,"state":"%s","seedBefore":%d,"seed":%d}', emu.framecount(), rw(0xFFFFC026), os.getenv("NHL95_STATE") or "", seedBefore, memory.read_u32_be(0xCC6A, "68K RAM")))
local games, lastGsp, startFrame = 0, rw(0xFFFFC020), emu.framecount()
while games < MAXGAMES do
  emu.frameadvance()
  local fc = emu.framecount()
  local gsp = rw(0xFFFFC020)
  if fc % 60 == 0 then
    put(string.format('{"type":"clock","frame":%d,"gsp":%d,"clock":%d,"pen":%d,"home":%d,"away":%d,"hmAp":%d,"awAp":%d}',
      fc, gsp, rw(0xFFFFC022), rw(0xFFFFC012), rw(0xFFFFC294), rw(0xFFFFC5FA), rw(HOME + 0x24), rw(AWAY + 0x24)))
  end
  if gsp ~= lastGsp then
    put(string.format('{"type":"gsp","frame":%d,"from":%d,"to":%d,"home":%s,"away":%s}', fc, lastGsp, gsp, team(HOME), team(AWAY)))
    if gsp == 4 then
      local sb, pl = rw(0xFFFFC02C), rw(0xFFFFC196)
      put(string.format('{"type":"options","optPerlen":%d,"optPen":%d,"optLine":%d,"optGoalie":%d,"team1":%d,"team2":%d}',
        rw(0xFFFFCC54), rw(0xFFFFCC5A), rw(0xFFFFCC5C), rw(0xFFFFCC56), rw(0xFFFFCC50), rw(0xFFFFCC52)))
      put(string.format('{"type":"final","frame":%d,"frames":%d,"perTimeTotal":%d,"home":%s,"away":%s,"scoreSumBytes":%d,"scoreSum":%s,"penSumLength":%d,"penSum":%s}',
        fc, fc - startFrame, rw(0xFFFFC026), team(HOME), team(AWAY), sb, bytes(0xFFFFC02E, math.min(sb, 360)), pl, bytes(0xFFFFC198, math.min(pl, 240))))
      for k = 1, 30 do emu.frameadvance() end
      client.screenshot(string.format("E:/emu/work/runs/final-%d.png", games))
      games = games + 1
    end
    if lastGsp == 4 and gsp == 0 then startFrame = fc end
    lastGsp = gsp
  end
end
f:close()
client.exit()
