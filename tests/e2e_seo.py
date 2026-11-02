"""Public idea pages + search basics (test mode).

Checks robots.txt, sitemap.xml (every listed page answers 200), each idea page's head (title, description,
canonical, og:image, JSON-LD), no horizontal scroll on iPhone 15 emulation, example images load, and that
"Start with this idea" opens the designer with that idea filled in (and Wood-burning pages pick the pattern).

usage: python3 tests/e2e_seo.py [base_url]
"""
import asyncio, json, re, sys
from playwright.async_api import async_playwright
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/')

async def main():
    res = {'fail': []}
    def check(ok, what):
        if not ok: res['fail'].append(what)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        c = await b.new_context(**p.devices['iPhone 15'])
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        robots = await (await pg.request.get(B + '/robots.txt')).text()
        check('Sitemap: https://craftedinhonor.com/sitemap.xml' in robots and 'Disallow: /api/' in robots, 'robots.txt')
        sm = await (await pg.request.get(B + '/sitemap.xml')).text()
        paths = [u.replace('https://craftedinhonor.com', '') for u in re.findall(r'<loc>([^<]+)</loc>', sm)]
        res['sitemap_urls'] = len(paths)
        for path in paths:
            r = await pg.request.get(B + path)
            check(r.status == 200, f'{path} status {r.status}')
            if path == '/':
                continue
            await pg.goto(B + path)
            h = await pg.evaluate("""() => ({
              title: document.title, desc: document.querySelector('meta[name=description]')?.content || '',
              canon: document.querySelector('link[rel=canonical]')?.href, og: document.querySelector('meta[property="og:image"]')?.content,
              ld: [...document.querySelectorAll('script[type="application/ld+json"]')].every(s => { try { JSON.parse(s.textContent); return true } catch { return false } }),
              h1: document.querySelectorAll('h1').length, sw: document.documentElement.scrollWidth, w: innerWidth,
              imgs: [...document.images].filter(i => !i.complete || !i.naturalWidth).length, cards: document.querySelectorAll('.card').length })""")
            check(10 < len(h['title']) <= 90, f'{path} title length {len(h["title"])}')
            check(70 <= len(h['desc']) <= 170, f'{path} description length {len(h["desc"])}')
            check(h['canon'] == 'https://craftedinhonor.com' + path, f'{path} canonical {h["canon"]}')
            check(h['og'] == 'https://craftedinhonor.com/og-image.jpg', f'{path} og:image')
            check(h['ld'] and h['h1'] == 1 and h['sw'] <= h['w'], f'{path} ld/h1/width {h}')
            await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); await pg.wait_for_timeout(300)
            bad = await pg.evaluate("[...document.images].filter(i => i.complete && !i.naturalWidth).length")
            check(bad == 0, f'{path} broken images')
            if path != '/ideas/': check(h['cards'] > 0, f'{path} no ideas')
        # home page head
        await pg.goto(B + '/')
        home = await pg.evaluate("({t:document.title, canon:document.querySelector('link[rel=canonical]')?.href, og:document.querySelector('meta[property=\"og:image\"]')?.content, links:document.querySelectorAll('.start-topics a').length})")
        check('Certificates' in home['t'] and home['canon'] == 'https://craftedinhonor.com/' and home['links'] >= 4, f'home {home}')
        og = await pg.request.get(B + '/og-image.jpg'); check(og.status == 200, 'og-image.jpg')
        # deep links
        await pg.goto(B + '/veterans-day-certificate/'); href = await pg.get_attribute('.card a', 'href')
        await pg.click('.card a'); await pg.wait_for_function("document.getElementById('idea').value.length > 20", timeout=10000)
        d1 = await pg.evaluate("({url: location.pathname + location.search, view: document.getElementById('studio').dataset.view, out: document.querySelector('input[name=output]:checked').value})")
        check(d1 == {'url': '/', 'view': 'start', 'out': 'certificate'}, f'deep link {d1}')
        await pg.goto(B + '/wood-burning-patterns/'); await pg.click('.card a')
        await pg.wait_for_function("document.getElementById('idea').value.length > 20", timeout=10000)
        d2 = await pg.evaluate("document.querySelector('input[name=output]:checked').value")
        check(d2 == 'pyrography', f'pattern deep link {d2}')
        await pg.goto(B + '/?idea=does-not-exist'); await pg.wait_for_timeout(800)
        check(await pg.evaluate("document.getElementById('idea').value === ''"), 'unknown idea id left text')
        res['sample_link'] = href
        res['errors'] = errs
        check(not errs, 'page errors')
        await b.close()
    res['ok'] = not res['fail']
    print(json.dumps(res, indent=1))

asyncio.run(main())
