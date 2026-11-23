import asyncio, sys, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":400,"height":860}, device_scale_factor=2)
        logs=[]
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
        await pg.goto("http://localhost:8765/_local.html")
        await pg.wait_for_timeout(int(sys.argv[1]) if len(sys.argv)>1 else 9000)
        await pg.screenshot(path="shot_full.png", full_page=False)
        await pg.evaluate("window.scrollTo(0, 700)"); await pg.wait_for_timeout(300); await pg.screenshot(path="shot_full2.png")
        for k in "ABC":
            el = await pg.query_selector(f"#c{k}")
            if el: await el.screenshot(path=f"shot_{k}.png")
        info = await pg.evaluate("""() => { const L = window.__lab; if (!L) return {loading: document.getElementById('loading').textContent};
          const m = a => a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
          return { loading: document.getElementById('loading').textContent, frames: L.bake.frames.length, voxMs: Math.round(L.bake.ms), atlas: [L.bake.AW, L.bake.AH],
            A: {bake: Math.round(L.A.stats.bakeMs), mem: L.A.stats.memMB.toFixed(2), ms: m(L.acc.A).toFixed(2)}, B: {ms: m(L.acc.B).toFixed(2), draws: L.B.stats.draws}, C: {ms: m(L.acc.C).toFixed(2), draws: L.C.stats.draws},
            score: L.S.score, t: L.S.t.toFixed(1), puck: [L.S.puck.x.toFixed(1), L.S.puck.z.toFixed(1), !!L.S.puck.owner] } }""")
        print(json.dumps(info))
        print("\n".join(logs[:30]))
        await b.close()
asyncio.run(main())
