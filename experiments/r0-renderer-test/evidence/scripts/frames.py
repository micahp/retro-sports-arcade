import asyncio, json
from playwright.async_api import async_playwright
SEQ = [("skate", None, 24, 2), ("shoot", "hShoot", 24, 2), ("check", "hCheck", 20, 2)]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":900,"height":1400}, device_scale_factor=1)
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:8765/_local.html")
        await pg.wait_for_function("window.__lab", timeout=60000)
        await pg.click("#zoom")
        await pg.evaluate("window.__lab.advance(180)")
        for name, act, n, stepn in SEQ:
            if act:
                found = await pg.evaluate("""(act) => { const L = window.__lab; for (let i = 0; i < 4000; i++) { L.advance(1); const p = L.S.skaters.find(q => q.one && q.one.name === act && q.one.t < 0.02); if (p) { window.__focus = p.id; return i; } } return -1; }""", act)
                print(name, "found after", found)
            for i in range(n):
                for k in "ABC":
                    el = await pg.query_selector(f"#c{k}")
                    await el.screenshot(path=f"frames/{name}_{k}_{i:03d}.png")
                await pg.evaluate(f"window.__lab.advance({stepn})")
        print(errs)
        await b.close()
asyncio.run(main())
