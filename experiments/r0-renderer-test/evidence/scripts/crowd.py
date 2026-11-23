import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":400,"height":860}, device_scale_factor=2)
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:8765/_local.html")
        await pg.wait_for_function("window.__lab", timeout=60000)
        res = {}
        for label, crowd in [("8", False), ("32", True)]:
            if crowd: await pg.click("#crowd")
            await pg.wait_for_timeout(5000)
            res[label] = await pg.evaluate("() => { const L = window.__lab, m = a => (a.reduce((s,x)=>s+x,0)/a.length).toFixed(2); return { n: L.S.skaters.length, A: m(L.acc.A), B: m(L.acc.B), C: m(L.acc.C) }; }")
        print(json.dumps(res), errs)
        await b.close()
asyncio.run(main())
