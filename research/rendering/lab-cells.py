import sys, time, io, json
from playwright.sync_api import sync_playwright
from PIL import Image
url, out = sys.argv[1], sys.argv[2]
cells = json.loads(sys.argv[3])   # [[action, yaw, u, pitch, zoom], ...]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 430, 'height': 900}, device_scale_factor=2)
    pg.goto(url); pg.wait_for_function('window.__hockey && window.__hockey.R', timeout=120000)
    pg.click('#openPlab'); time.sleep(0.4)
    pg.evaluate("() => { document.getElementById('plab').style.visibility = 'hidden'; document.getElementById('plPlay').checked = false; }")
    ims = []
    for act, yaw, u, pitch, zoom in cells:
        pg.evaluate(f"""() => {{ const set = (id, v) => {{ const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }};
          const s = document.querySelector('#plab .pitchSel'); s.value = '{pitch}'; s.dispatchEvent(new Event('change'));
          document.getElementById('plAct').value = '{act}'; set('plYaw', '{yaw}'); set('plT', '{int(u * 1000)}'); document.getElementById('plPlay').checked = false; set('plZoom', '{zoom}'); }}""")
        time.sleep(0.15)
        ims.append(Image.open(io.BytesIO(pg.screenshot(clip={'x': 65, 'y': 300, 'width': 300, 'height': 300}))))
        print(act, yaw, u, pg.evaluate("() => document.getElementById('plabNow').textContent"))
    W = sum(i.width for i in ims); o = Image.new('RGB', (W, ims[0].height), 'white'); x = 0
    for i in ims: o.paste(i, (x, 0)); x += i.width
    o.save(out)
    b.close()
