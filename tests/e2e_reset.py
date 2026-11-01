"""Forgotten password (test mode — no RESEND_API_KEY, so the local server returns the link instead of
emailing it). iPhone 15 emulation: Sign in → "Forgot your password?" → email → confirmation; unknown
email gets the same confirmation; opening the link shows "Choose a new password" with the token removed
from the address bar; new password signs in; the old session elsewhere is signed out; old password fails,
new works; the link can't be used twice; a 4th request within the hour sends nothing.

usage: python3 tests/e2e_reset.py [base_url] [out_dir]
"""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
B = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8788').rstrip('/') + '/'
O = (sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/e2e-reset').rstrip('/') + '/'
os.makedirs(O, exist_ok=True)
EMAIL = f'forgetful{int(time.time())}@example.com'

POST = "(async([u,b])=>{const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});return [r.status, await r.json()]})"

async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        # an existing session on another device
        actx = await b.new_context(); ap = await actx.new_page(); await ap.goto(B)
        await ap.evaluate(POST, ['/api/auth/signup', {'email': EMAIL, 'password': 'oldpass123'}])
        before = await ap.evaluate("fetch('/api/config').then(r=>r.json()).then(c=>!!c.user)")

        ctx = await b.new_context(**p.devices['iPhone 15'])
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B)
        await pg.click('#accountBtn'); await pg.wait_for_selector('#authForgotBtn:not([hidden])')
        await pg.click('#authForgotBtn')
        forgot_ui = await pg.evaluate("[document.getElementById('authTitle').textContent, document.getElementById('authPassRow').hidden, document.getElementById('authSeg').hidden, document.getElementById('authSubmit').textContent]")
        await pg.fill('#authEmail', 'nobody-here@example.com'); await pg.click('#authSubmit')
        await pg.wait_for_selector('#authOk:not([hidden])')
        unknown = await pg.evaluate("[document.getElementById('authOk').textContent, window.__rs.lastResetLink||null]")
        await pg.click('#authBackBtn'); await pg.click('#authForgotBtn')
        await pg.fill('#authEmail', EMAIL); await pg.click('#authSubmit')
        await pg.wait_for_selector('#authOk:not([hidden])')
        await pg.screenshot(path=O + 'iphone-1-link-sent.png')
        link = await pg.evaluate("window.__rs.lastResetLink")
        # open the emailed link
        await pg.goto(link.replace('http://127.0.0.1:8788/', B))
        await pg.wait_for_selector('#authSheet:not([hidden])')
        reset_ui = await pg.evaluate("[document.getElementById('authTitle').textContent, document.getElementById('authEmailRow').hidden, document.getElementById('authPassLabel').textContent, location.search]")
        await pg.screenshot(path=O + 'iphone-2-new-password.png')
        await pg.fill('#authPass', 'newpass456'); await pg.click('#authSubmit')
        await pg.wait_for_function("window.__rs.state.user && document.getElementById('authSheet').hidden", timeout=15000)
        signed_in = await pg.evaluate("[window.__rs.state.user.email, document.getElementById('authSheet').hidden]")
        after_other = await ap.evaluate("fetch('/api/config').then(r=>r.json()).then(c=>!!c.user)")
        old_pw = await ap.evaluate(POST, ['/api/auth/login', {'email': EMAIL, 'password': 'oldpass123'}])
        new_pw = await ap.evaluate(POST, ['/api/auth/login', {'email': EMAIL, 'password': 'newpass456'}])
        token = link.split('reset=')[1]
        reuse = await ap.evaluate(POST, ['/api/auth/reset', {'token': token, 'password': 'another789'}])
        # rate limit: this email already has 1 request this hour → 2 more allowed, then silence
        links = []
        for i in range(3):
            r = await ap.evaluate(POST, ['/api/auth/forgot', {'email': EMAIL}])
            links.append(bool(r[1].get('devLink')))
        res = dict(other_device_signed_in_before=before, forgot_ui=forgot_ui, unknown_email=unknown, reset_ui=reset_ui, signed_in=signed_in,
                   other_device_signed_out=not after_other, old_password_status=old_pw[0], new_password_status=new_pw[0],
                   reuse=reuse, links_sent_2_3_4=links, errors=errs)
        await b.close()
    print(json.dumps(res, indent=1))

asyncio.run(main())
