"""Makes the finished example images for the public idea pages and the social preview image (og-image.jpg).

Uses the real app on a local test server: picks Bart's Veterans Day seed artwork from the gallery, designs over it
with a fictional veteran's wording, and exports the PNG the app itself renders — so the examples show exactly what
a user gets. Then writes JPEGs to public/img/examples/ and public/og-image.jpg. No AI is called (gallery art).

usage: python3 tests/make_examples.py [base_url]
"""
import asyncio, base64, io, os, sys, time
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'public/img/examples')
os.makedirs(OUT, exist_ok=True)

# seed title (prefix) → output file, wording. Names are fictional.
JOBS = [
    ('A Lifetime of Honor — bald eagle', 'veteran-eagle-lifetime', 1200, 1.35,
     dict(name='Raymond J. Kessler', title='', kicker='Presented to', body='United States Navy, 1966–1970. With deep gratitude for your service.', date='Veterans Day 2026', details='', presented='', sig1Name='', sig1Role='', sig2Name='', sig2Role='')),
    ('With Honor & Gratitude — folded flag', 'veteran-folded-flag', 1200, 1.15,
     dict(name='Sgt. Linda M. Ortiz', title='', kicker='Honoring', body='United States Army, 1989–2011. Twenty-two years of faithful service.', date='November 11, 2026', details='', presented='', sig1Name='', sig1Role='', sig2Name='', sig2Role='')),
    ('You Answered the Call — combat boots (tall)', 'veteran-boots-tall', 1200, 1.5,
     dict(name='Cpl. Thomas Reed', title='', kicker='In honor of', body='United States Marine Corps, 1968–1972', date='Veterans Day 2026', details='', presented='', sig1Name='', sig1Role='', sig2Name='', sig2Role='')),
]

async def main():
    T = int(time.time())
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(B)
        await pg.click('#accountBtn')
        await pg.fill('#authEmail', f'examples{T}@example.com'); await pg.fill('#authPass', 'examplespass1')
        await pg.click('#authSeg button[data-mode=signup]'); await pg.click('#authSubmit')
        await pg.wait_for_function('window.__rs.state.user')
        made = []
        for title, name, width, scale, text in JOBS:
            await pg.evaluate("document.getElementById('navHomeBtn').click()")
            await pg.wait_for_timeout(400)
            await pg.evaluate("document.getElementById('idea').value=''")
            await pg.click('#browseBtn'); await pg.click('#libSeg button[data-tab=gallery]')
            await pg.wait_for_selector('.gal-item'); await pg.wait_for_timeout(500)
            ok = await pg.evaluate("""(t)=>{const it=[...document.querySelectorAll('.gal-item')].find(e=>e.querySelector('span').textContent.trim()===t);
              if(!it) return false; it.querySelector('.gal-open').click(); return true}""", title)
            assert ok, 'seed not found: ' + title
            await pg.wait_for_selector('#startGalNote:not([hidden])', timeout=15000)
            await pg.click('#designBtn')
            await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.art && document.getElementById('stageOverlay').hidden", timeout=30000)
            await pg.wait_for_timeout(800)
            data = await pg.evaluate("""async ([text, scale])=>{const s=window.__rs.state; Object.assign(s.project.text, text);
              s.project.style.lettering = 'engraved'; s.project.style.scale = scale;
              const blob = await window.__rs.renderPng(s.project, 1500);
              const buf = new Uint8Array(await blob.arrayBuffer()); let bin=''; for (const x of buf) bin+=String.fromCharCode(x); return btoa(bin)}""", [text, scale])
            im = Image.open(io.BytesIO(base64.b64decode(data))).convert('RGB')
            im.thumbnail((width, width))
            path = os.path.join(OUT, name + '.jpg')
            im.save(path, quality=84, optimize=True, progressive=True)
            made.append((path, im.size))
        await b.close()
    for m in made: print(m)
    if errs: print('page errors:', errs)

    # social preview card 1200×630: the eagle example on the left, the name and promise on the right
    eagle = Image.open(os.path.join(OUT, 'veteran-eagle-lifetime.jpg'))
    card = Image.new('RGB', (1200, 630), '#f5f2ec')
    e = eagle.copy(); e.thumbnail((690, 560))
    card.paste(e, (40, (630 - e.size[1]) // 2))
    ImageDraw.Draw(card).rectangle([40, (630 - e.size[1]) // 2, 40 + e.size[0] - 1, (630 + e.size[1]) // 2 - 1], outline='#d6cdbb', width=2)
    d = ImageDraw.Draw(card)
    F = os.path.join(ROOT, 'public/fonts')
    serif = lambda s: ImageFont.truetype(os.path.join(F, 'Playfair-Bold.ttf'), s)
    sans = lambda s: ImageFont.truetype(os.path.join(F, 'Montserrat-SemiBold.ttf'), s)
    x = 40 + e.size[0] + 40
    d.text((x, 150), 'Crafted', font=serif(58), fill='#1f3a5f')
    d.text((x, 220), 'In Honor', font=serif(58), fill='#a9802f')
    y = 330
    for line in ['Personalized certificates,', 'awards & wood-burning', 'patterns — made for them.']:
        d.text((x, y), line, font=sans(26), fill='#444b5a'); y += 40
    d.text((x, 470), 'craftedinhonor.com', font=sans(22), fill='#1f3a5f')
    card.save(os.path.join(ROOT, 'public/og-image.jpg'), quality=86, optimize=True, progressive=True)
    print('og-image.jpg written')

asyncio.run(main())
