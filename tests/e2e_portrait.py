"""Portrait (tall) pages, test mode.

Desktop: choose Portrait on the start screen → Design it → the artwork, stage and lettering are tall;
PNG export is tall; PDF page is tall Letter (612 x 792); the wood-burning version keeps the tall shape
(no AI); "Redraw as a wide page" makes landscape art (one AI design) and "Redraw as a tall page" goes
back; versions switch shape; reopening from My projects keeps it; the projects thumbnail is tall.
Plain design (photo + words, no artwork): "Make it a tall page" turns the paper instantly, no AI call.
iPhone 15 emulation: tall wood-burning pattern, editor screenshot (pinned preview must fit).
Gallery: tall artwork in the gallery keeps its shape when used.

usage: python3 tests/e2e_portrait.py [base_url] [out_dir]
"""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
O = (sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/e2e-portrait').rstrip('/') + '/'
os.makedirs(O, exist_ok=True)
T = int(time.time())
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')

async def signin(pg, email, pw='portraitpass1'):
    await pg.goto(B)
    await pg.click('#accountBtn')
    await pg.fill('#authEmail', email); await pg.fill('#authPass', pw)
    await pg.click('#authSeg button[data-mode=signup]')
    await pg.click('#authSubmit')
    await pg.wait_for_function('window.__rs.state.user')

async def settle(pg):
    await pg.wait_for_function("!window.__rs.state.save.dirty && !window.__rs.state.save.inflight", timeout=20000)

async def art_ready(pg, n):
    await pg.wait_for_function(f"window.__rs.state.project && window.__rs.state.project.artHistory.length>={n} && !window.__rs.state.busyArt", timeout=60000)

STAGE = "(()=>{const r=document.getElementById('stage').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})()"
SVGVB = "document.querySelector('#sheetHolder svg').getAttribute('viewBox')"
PDFSIZE = """(async()=>{const b=await window.__rs.renderPdf(window.__rs.state.project,{paper:'letter'});const d=await PDFLib.PDFDocument.load(b);const s=d.getPage(0).getSize();return [Math.round(s.width),Math.round(s.height)]})()"""
PNGSIZE = """(async()=>{const bl=await window.__rs.renderPng(window.__rs.state.project,1200);const im=await createImageBitmap(bl);return [im.width,im.height]})()"""
# lettering stays inside the page and inside the measured lettering area
INSIDE = """(()=>{const p=window.__rs.state.project;const svg=document.querySelector('#sheetHolder svg');const [,, W, H]=svg.getAttribute('viewBox').split(' ').map(Number);
  return [...svg.querySelectorAll('text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.y>=0&&b.x+b.width<=W&&b.y+b.height<=H})})()"""

async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        arts = []; pg.on('request', lambda r: r.url.endswith('/api/art') and r.method == 'POST' and arts.append(json.loads(r.post_data or '{}').get('orient')))
        await signin(pg, f'tall{T}@example.com')
        await pg.screenshot(path=O + 'desk-0-start.png')
        await pg.fill('#idea', 'Retirement for Sergeant Dale Brooks, US Army, 1968-1992. A bald eagle over the mountains.')
        await pg.check('input[name=orient][value=portrait]', force=True)
        await pg.click('#designBtn')
        await art_ready(pg, 1); await settle(pg)
        await pg.fill('#f-name', 'Sergeant First Class Dale R. Brooks')
        await pg.fill('#f-date', 'November 11, 2026')
        await pg.click('#subSigs summary')
        await pg.fill('#f-sig1Name', 'Colonel Margaret Whitfield-Anderson'); await pg.fill('#f-sig1Role', 'Battalion Commander')
        await pg.fill('#f-sig2Name', 'Command Sergeant Major Luis Hernandez'); await pg.fill('#f-sig2Role', 'Senior Enlisted Advisor')
        await settle(pg); await pg.wait_for_timeout(600)
        await pg.screenshot(path=O + 'desk-1-portrait-certificate.png')
        # signer names never overlap each other
        d0 = await pg.evaluate("""(()=>{const t=[...document.querySelectorAll('#sheetHolder text')].filter(e=>/sig[12]|date/.test(e.dataset.field)).map(e=>e.getBBox());
          return t.every((a,i)=>t.every((b,j)=>j<=i||a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1))})()""")
        d = {'sig_no_overlap': d0}
        d['art_orient'] = await pg.evaluate("window.__rs.state.project.art.orient||'landscape'")
        d['project_orient'] = await pg.evaluate("window.__rs.state.project.orient")
        d['viewBox'] = await pg.evaluate(SVGVB)
        d['stage'] = await pg.evaluate(STAGE)
        d['text_inside'] = await pg.evaluate(INSIDE)
        d['zone'] = await pg.evaluate("window.__rs.state.project.art.zone||null")
        d['png'] = await pg.evaluate(PNGSIZE)
        d['pdf_letter'] = await pg.evaluate(PDFSIZE)
        d['summary'] = await pg.inner_text('#artSummary')
        # wood-burning version keeps the shape (no AI)
        n_ai = len(arts)
        await pg.evaluate("document.getElementById('secArt').open=true")
        await pg.click('#switchOutputBtn')
        await art_ready(pg, 2); await settle(pg); await pg.wait_for_timeout(400)
        d['wood_orient'] = await pg.evaluate("[window.__rs.state.project.output, window.__rs.state.project.art.orient||'landscape', !!window.__rs.state.project.art.derivedFrom]")
        d['wood_ai_calls'] = len(arts) - n_ai
        await pg.screenshot(path=O + 'desk-2-portrait-wood.png')
        # redraw as a wide page and back
        d['orient_btn'] = await pg.inner_text('#orientBtn')
        await pg.click('#orientBtn')
        await art_ready(pg, 3); await settle(pg); await pg.wait_for_timeout(400)
        d['after_wide'] = await pg.evaluate("[window.__rs.state.project.art.orient||'landscape', window.__rs.state.project.orient]")
        d['after_wide_stage'] = await pg.evaluate(STAGE)
        d['after_wide_pdf'] = await pg.evaluate(PDFSIZE)
        d['after_wide_text'] = await pg.evaluate("window.__rs.state.project.text.name")
        await pg.screenshot(path=O + 'desk-3-redrawn-wide.png')
        # tap the tall version in the versions strip
        await pg.click('#versions .version:nth-child(2)')
        await pg.wait_for_timeout(500); await settle(pg)
        d['version_back'] = await pg.evaluate("[window.__rs.state.project.art.orient||'landscape', document.getElementById('stage').classList.contains('portrait')]")
        d['ai_orients_sent'] = arts
        pid = await pg.evaluate("window.__rs.state.project.id")
        # reopen from My projects
        await pg.click('#navHomeBtn'); await pg.wait_for_timeout(500)
        await pg.click('#projectsBtn'); await pg.wait_for_selector(f'.proj[data-id="{pid}"] .proj-thumb svg')
        await pg.wait_for_timeout(500)
        d['thumb_viewBox'] = await pg.evaluate(f"document.querySelector('.proj[data-id=\"{pid}\"] .proj-thumb svg').getAttribute('viewBox')")
        await pg.screenshot(path=O + 'desk-4-projects.png')
        await pg.click(f'.proj[data-id="{pid}"] .proj-open')
        await pg.wait_for_function("window.__rs.state.project && document.getElementById('studio').dataset.view==='editor'")
        await pg.wait_for_timeout(600)
        d['reopened'] = await pg.evaluate("[window.__rs.state.project.art.orient||'landscape', document.querySelector('#sheetHolder svg').getAttribute('viewBox')]")
        d['errors'] = errs
        res['desktop'] = d

        # plain design: photo + words, turn the paper
        n_ai = len(arts)
        await pg.click('#navHomeBtn'); await pg.wait_for_timeout(400)
        await pg.fill('#idea', 'Thank you to our wonderful school librarian, Ms. Rivera')
        await pg.set_input_files('#startPhotoInput', os.path.join(FIX, 'pet-cat.jpg'))
        await pg.wait_for_selector('#noArtRow:not([hidden])')
        await pg.check('#noArtToggle')
        await pg.check('input[name=orient][value=landscape]', force=True)
        await pg.click('#designBtn')
        await pg.wait_for_function("window.__rs.state.project && window.__rs.state.project.plainBg && window.__rs.state.project.photo && window.__rs.state.project.photo.key && document.getElementById('stageOverlay').hidden", timeout=30000)
        await settle(pg)
        await pg.evaluate("document.getElementById('secArt').open=true")
        before = await pg.evaluate(SVGVB)
        btn = await pg.inner_text('#orientBtn')
        await pg.click('#orientBtn'); await pg.wait_for_timeout(600); await settle(pg)
        await pg.screenshot(path=O + 'desk-5-plain-tall.png')
        res['plain'] = dict(before=before, button=btn, after=await pg.evaluate(SVGVB), photo_place=await pg.evaluate("window.__rs.state.project.photo.place"),
                            text_inside=await pg.evaluate(INSIDE), ai_calls=len(arts) - n_ai, pdf=await pg.evaluate(PDFSIZE))

        # ---------- iPhone ----------
        ictx = await b.new_context(**p.devices['iPhone 15'])
        ip = await ictx.new_page(); ierrs = []; ip.on('pageerror', lambda e: ierrs.append(str(e)))
        await signin(ip, f'talliphone{T}@example.com')
        await ip.fill('#idea', 'Veterans Day honor for a Navy veteran, a fouled anchor with a rope border')
        await ip.check('input[name=output][value=pyrography]', force=True)
        await ip.check('input[name=orient][value=portrait]', force=True)
        await ip.screenshot(path=O + 'iphone-0-start.png', full_page=True)
        await ip.click('#designBtn')
        await art_ready(ip, 1); await settle(ip); await ip.wait_for_timeout(700)
        await ip.screenshot(path=O + 'iphone-1-editor.png')
        st = await ip.evaluate("(()=>{const r=document.getElementById('stage').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),Math.round(r.bottom),innerHeight]})()")
        await ip.fill('#f-name', 'Petty Officer James Ortiz')
        await ip.wait_for_timeout(400)
        await ip.screenshot(path=O + 'iphone-2-typing.png')
        res['iphone'] = dict(stage_w_h_bottom_vh=st, orient=await ip.evaluate("window.__rs.state.project.art.orient||'landscape'"), text_inside=await ip.evaluate(INSIDE),
                             scroll_w=await ip.evaluate("document.documentElement.scrollWidth"), errors=ierrs)

        # ---------- gallery: tall art keeps its shape ----------
        # share the desktop tall design (it started from my own words, so turn sharing on), then use it
        await pg.goto(B); await pg.wait_for_function('window.__rs.state.user')
        await pg.evaluate(f"""(async()=>{{const r=await (await fetch('/api/projects/{pid}')).json();const p=r.project;p.share=true;
            p.artHistory=p.artHistory.filter(a=>a.orient==='portrait');p.art=p.artHistory.find(a=>!a.derivedFrom);
            await fetch('/api/projects/'+p.id,{{method:'PUT',headers:{{'content-type':'application/json'}},body:JSON.stringify(p)}})}})()""")
        g = await ip.evaluate("fetch('/api/gallery').then(r=>r.json()).then(d=>d.items.filter(i=>i.orient==='portrait').map(i=>i.id))")
        res['gallery'] = dict(portrait_items=len(g))
        if g:
            await ip.click('#navHomeBtn'); await ip.wait_for_timeout(300)
            await ip.click('#browseBtn'); await ip.click('#libSeg button[data-tab=gallery]')
            await ip.wait_for_selector(f'.gal-item[data-id="{g[0]}"]')
            await ip.wait_for_timeout(800)
            await ip.screenshot(path=O + 'iphone-3-gallery.png')
            await ip.click(f'.gal-item[data-id="{g[0]}"] .gal-open')
            await ip.wait_for_selector('#startGalNote:not([hidden])')
            res['gallery']['orient_radio'] = await ip.evaluate("document.querySelector('input[name=orient]:checked').value")
            await ip.click('#designBtn')
            await ip.wait_for_function("window.__rs.state.project && window.__rs.state.project.art && window.__rs.state.project.art.fromGallery && document.getElementById('stageOverlay').hidden", timeout=30000)
            await ip.wait_for_timeout(600)
            res['gallery']['used_orient'] = await ip.evaluate("[window.__rs.state.project.art.orient||'landscape', document.getElementById('stage').classList.contains('portrait')]")
            await ip.screenshot(path=O + 'iphone-4-from-gallery.png')
            # tidy: take the test item out of the gallery again
            await pg.evaluate(f"""(async()=>{{const r=await (await fetch('/api/projects/{pid}')).json();const p=r.project;p.share=false;
                await fetch('/api/projects/'+p.id,{{method:'PUT',headers:{{'content-type':'application/json'}},body:JSON.stringify(p)}})}})()""")
        await b.close()
    print(json.dumps(res, indent=1))

asyncio.run(main())
