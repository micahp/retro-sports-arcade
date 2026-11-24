"""Contact sheet from the in-game Player Lab: rows = actions, columns = 8 facings."""
import sys, time, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
url, out, pitch = sys.argv[1], sys.argv[2], int(sys.argv[3])
ACTIONS = [('idle', 'hGlide', 0.25), ('skate', 'hSkate', 0.25), ('carry', 'carry', 0.25), ('pass (release)', 'hPass', 0.55),
           ('wrist shot (release)', 'hShoot', 0.6), ('check (contact)', 'hCheck', 0.45), ('fall (down)', 'hFall', 1.0)]
YAWS = [0, 45, 90, 135, 180, 225, 270, 315]
NAMES = {0: 'up', 45: 'up-right', 90: 'right', 135: 'down-right', 180: 'down', 225: 'down-left', 270: 'left', 315: 'up-left'}
C = 230
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 430, 'height': 900}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_function('window.__hockey && window.__hockey.R', timeout=120000)
    pg.click('#openPlab'); time.sleep(0.5)
    pg.evaluate(f"""() => {{ document.getElementById('plab').style.visibility = 'hidden'; document.getElementById('plPlay').checked = false;
      const s = document.querySelector('#plab .pitchSel'); s.value = '{pitch}'; s.dispatchEvent(new Event('change')); }}""")
    sheet = Image.new('RGB', (130 + C * len(YAWS), 30 + C * len(ACTIONS)), 'white'); d = ImageDraw.Draw(sheet)
    d.text((6, 8), f"Rink '95 Player Lab, camera {pitch} deg. Markers: white top hand, orange heel, cyan toe, magenta = physics puck contact (+ ring on the ice)", fill='black')
    for c, y in enumerate(YAWS): d.text((130 + c * C + 8, 20), f'{y} deg ({NAMES[y]})', fill='black')
    for r, (label, act, u) in enumerate(ACTIONS):
        d.text((6, 30 + r * C + C // 2), label, fill='black')
        for c, y in enumerate(YAWS):
            pg.evaluate(f"""() => {{ const set = (id, v) => {{ const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }};
              document.getElementById('plAct').value = '{act}'; set('plYaw', '{y}'); set('plT', '{int(u * 1000)}'); document.getElementById('plPlay').checked = false; set('plZoom', '62'); }}""")
            time.sleep(0.12)
            png = pg.screenshot(clip={'x': 215 - 105, 'y': 450 - 105, 'width': 210, 'height': 210})
            sheet.paste(Image.open(io.BytesIO(png)).resize((C, C)), (130 + c * C, 30 + r * C))
    sheet.save(out); print('saved', out, sheet.size, 'errors', errs)
    b.close()
