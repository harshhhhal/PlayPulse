"""LAYOUT-ONLY check of app.html with a STUBBED Firebase (signed-in user, empty database).
This is NOT an integration test: it never talks to real Firebase or YouTube. It verifies the
signed-in shell renders, has no horizontal overflow, shows the right navigation per breakpoint,
and that tab switching/theme toggle work. Usage: python3 tests/browser/app_shell_check.py"""
import http.server, socketserver, threading, os, functools, json, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
VENDOR = os.environ.get('PP_VENDOR', '/tmp/vendor/node_modules')  # real DOMPurify + Chart.js from npm (served in place of the CDN copies)
WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920]
STUB = r"""
(function(){
  const snap = (data, exists) => ({exists: !!exists, id:'x', data:()=>data||{}, ref:{}, get:()=>undefined});
  const qsnap = {docs: [], empty: true, size: 0, forEach(){}};
  function chain(){ const o = {
    get: async()=>qsnap, set: async()=>{}, update: async()=>{}, add: async()=>({id:'new'}), delete: async()=>{},
    onSnapshot: (cb)=>{ try{cb(snap({}, false));}catch(e){} return ()=>{}; },
    collection: chain, doc: chain, orderBy: chain, where: chain, limit: chain };
    o.get = async function(){ return Object.assign({}, qsnap, snap({}, false), {docs: []}); }; return o; }
  const user = {uid:'stub-user', displayName:'Layout Tester', email:'tester@example.com', photoURL:''};
  const db = Object.assign(chain(), {batch:()=>({set(){},update(){},delete(){},commit:async()=>{}}), enablePersistence: ()=>Promise.resolve()});
  const fs = ()=>db; fs.FieldValue = {serverTimestamp:()=>0, increment:n=>n}; fs.Timestamp={now:()=>({toDate:()=>new Date()})};
  const auth = {onAuthStateChanged: cb=>{ setTimeout(()=>cb(user),0); return ()=>{}; }, signOut: async()=>{}, currentUser: user};
  const a = ()=>auth; a.GoogleAuthProvider = function(){};
  window.firebase = {initializeApp(){}, auth: a, firestore: fs, apps:[1]};
})();
"""

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}/'
    fails = []
    def route(r):
        u = r.request.url
        if u.startswith(base): return r.continue_()
        if 'gstatic.com/firebasejs' in u and 'firebase-app-compat' in u: return r.fulfill(body=STUB, content_type='application/javascript')
        if 'dompurify' in u: return r.fulfill(path=VENDOR + '/dompurify/dist/purify.min.js', content_type='application/javascript')
        if 'chart.js' in u: return r.fulfill(path=VENDOR + '/chart.js/dist/chart.umd.js', content_type='application/javascript')
        if u.endswith('.js') or '.js?' in u or 'jsdelivr' in u or 'cdnjs' in u and u.endswith('.js'): return r.fulfill(body='', content_type='application/javascript')
        return r.abort()
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w in WIDTHS:
            ctx = b.new_context(viewport={'width': w, 'height': 800}, reduced_motion='reduce'); pg = ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:140]))
            pg.route('**/*', route)
            pg.goto(base + 'app.html', wait_until='domcontentloaded'); pg.wait_for_timeout(900)
            info = pg.evaluate('''() => { const d=document.documentElement; const vis=s=>{const e=document.querySelector(s); return !!e && getComputedStyle(e).display!=='none' && e.getBoundingClientRect().width>0};
              return {overflow: d.scrollWidth > d.clientWidth+1, scrollW: d.scrollWidth, appVisible: vis('#app') , bottomNav: vis('.bottom-nav'), sidebar: vis('#sidebar'), h1: document.querySelectorAll('h1').length} }''')
            # tab switching through whichever nav is visible
            sel = '.bottom-nav a[data-tab="analytics"]' if info['bottomNav'] else '.sidebar-nav .nav-item[data-tab="analytics"]'
            try:
                bb = pg.locator(sel).bounding_box(); pg.mouse.click(bb['x'] + bb['width']/2, bb['y'] + bb['height']/2); pg.wait_for_timeout(250)  # real mouse event (locator.click's stability wait stalls on this fixed nav)
                tab_ok = pg.evaluate("document.getElementById('tab-analytics').classList.contains('active') && location.hash==='#analytics'")
                cur = pg.evaluate("document.querySelectorAll('[aria-current=page]').length")
            except Exception as e:
                tab_ok, cur = False, -1; print('  click error:', str(e).splitlines()[0:6])
            # theme toggle
            before = pg.evaluate("document.documentElement.dataset.theme")
            try:
                pg.click('#btn-theme-topbar', timeout=2000); pg.wait_for_timeout(100)
                theme_ok = pg.evaluate("document.documentElement.dataset.theme") != before
            except Exception: theme_ok = False
            row = dict(width=w, **info, tab_switch=tab_ok, aria_current=cur, theme_toggle=theme_ok, js_errors=errs)
            print(json.dumps(row)); 
            if info['overflow'] or not info['appVisible'] or not tab_ok or not theme_ok: fails.append(w)
            if w in (390, 1280): pg.screenshot(path=f'/tmp/app_{w}.png')
            ctx.close()
        b.close()
    srv.shutdown()
    print('FAILED widths:', fails or 'none'); sys.exit(1 if fails else 0)
main()
