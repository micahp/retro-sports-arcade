-- NHL 95 recorder v2: everything record.lua logs, plus (RAM only, no input)
--   traj  every 6 frames: puck x,y and all 12 players' x,y (SortCords, 128-byte objects; home 0-5, away 6-11)
--   poss  every change of puck carrier ($FFB3C2, -1 loose), with puck x,y
--   stop  every clock stop (gmode bit 0) with RefPen (stoppage / penalty code) and puck x,y
--   drop  every clock restart (= the puck is dropped at a faceoff), with puck x,y
--   shot  every increase of a team's shots counter, with the release: the latest frame in the previous 2 s
--         when the puck's speed jumped (struck), its position, speed and the carrier just before it
-- Env: NHL95_RUN, NHL95_GAMES, NHL95_STATE, NHL95_SEED (as record.lua).
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
put(string.format('{"type":"start","frame":%d,"perTimeTotal":%d,"state":"%s","seedBefore":%d,"seed":%d}', emu.framecount(), rw(0xFFFFC026), os.getenv("NHL95_STATE") or "", seedBefore, memory.read_u32_be(0xCC6A, D)))
local games, lastGsp, startFrame = 0, rw(0xFFFFC020), emu.framecount()
local lastPc, lastStopped, lastShots = rs(0xFFFFB3C2), (rb(0xFFFFBEF0) & 1), { rw(HOME), rw(AWAY) }
local ring, RN, ri = {}, 120, 0          -- 2 s of puck history
while games < MAXGAMES do
  emu.frameadvance()
  local fc = emu.framecount()
  local gsp = rw(0xFFFFC020)
  local px, py, pvx, pvy = rs(PUCK), rs(PUCK + 0x14), rs(0xFFFFB38A), rs(0xFFFFB38C)
  local pc = rs(0xFFFFB3C2)
  ri = ri % RN + 1; ring[ri] = { fc, px, py, pvx, pvy, pc, gsp, rw(0xFFFFC022) }
  if fc % 6 == 0 then
    local t = { fc, px, py }
    for i = 0, 11 do local o = SC + i * 128; t[#t + 1] = rs(o); t[#t + 1] = rs(o + 0x14) end
    put('{"type":"traj","v":[' .. table.concat(t, ",") .. ']}')
  end
  if fc % 60 == 0 then
    put(string.format('{"type":"clock","frame":%d,"gsp":%d,"clock":%d,"home":%d,"away":%d,"hmAp":%d,"awAp":%d}',
      fc, gsp, rw(0xFFFFC022), rw(0xFFFFC294), rw(0xFFFFC5FA), rw(HOME + 0x24), rw(AWAY + 0x24)))
  end
  if pc ~= lastPc then
    put(string.format('{"type":"poss","frame":%d,"gsp":%d,"clock":%d,"from":%d,"to":%d,"x":%d,"y":%d}', fc, gsp, rw(0xFFFFC022), lastPc, pc, px, py))
    lastPc = pc
  end
  local stopped = rb(0xFFFFBEF0) & 1  -- btst on memory tests a byte: gmode high byte
  if stopped ~= lastStopped then
    if stopped == 1 then
      put(string.format('{"type":"stop","frame":%d,"gsp":%d,"clock":%d,"refPen":%d,"x":%d,"y":%d}', fc, gsp, rw(0xFFFFC022), rw(0xFFFFC01E), px, py))
    else
      put(string.format('{"type":"drop","frame":%d,"gsp":%d,"clock":%d,"x":%d,"y":%d}', fc, gsp, rw(0xFFFFC022), px, py))
    end
    lastStopped = stopped
  end
  local sh = { rw(HOME), rw(AWAY) }
  for k = 1, 2 do
    if sh[k] > lastShots[k] then
      -- release: newest frame in the ring where speed rose by > 1/3 versus the frame before and the puck was then loose
      local best, carrier = nil, -1
      for j = 0, RN - 2 do
        local a = ring[((ri - 1 - j) % RN) + 1]; local b = ring[((ri - 2 - j) % RN) + 1]
        if a and b then
          local va, vb = a[4] * a[4] + a[5] * a[5], b[4] * b[4] + b[5] * b[5]
          if a[6] < 0 and va > vb * 1.8 + 1e6 then best = a; carrier = b[6]; break end
        end
      end
      if best then
        put(string.format('{"type":"shot","frame":%d,"team":%d,"gsp":%d,"clock":%d,"rel":{"frame":%d,"x":%d,"y":%d,"vx":%d,"vy":%d,"carrier":%d}}',
          fc, k - 1, gsp, rw(0xFFFFC022), best[1], best[2], best[3], best[4], best[5], carrier))
      else
        put(string.format('{"type":"shot","frame":%d,"team":%d,"gsp":%d,"clock":%d,"rel":null}', fc, k - 1, gsp, rw(0xFFFFC022)))
      end
    end
    lastShots[k] = sh[k]
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

