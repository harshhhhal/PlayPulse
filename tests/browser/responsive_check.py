"""Responsive + console check for the static pages. Usage: python3 tests/browser/responsive_check.py [outfile.json]
Serves the project on localhost and loads each page at the 9 required widths in headless Chromium.
External CDNs (Firebase, Font Awesome, fonts, GTM) are blocked in sandboxed environments; that is
reported separately and is NOT counted as an application error."""
import http.server, socketserver, threading, json, sys, os, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920]
PAGES = ['index.html', 'about.html', 'help.html', 'privacy.html', 'terms.html']

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()

def main():
    handler = functools.partial(Quiet, directory=ROOT)
    srv = socketserver.TCPServer(('127.0.0.1', 0), handler); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}/'
    results = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for page_name in PAGES:
            for w in WIDTHS:
                ctx = b.new_context(viewport={'width': w, 'height': 800})
                pg = ctx.new_page()
                local_fail, errors = [], []
                pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
                pg.on('requestfailed', lambda r: local_fail.append(r.url) if r.url.startswith(base) else None)
                pg.on('response', lambda r: local_fail.append(f'{r.status} {r.url}') if r.url.startswith(base) and r.status >= 400 else None)
                pg.on('pageerror', lambda e: errors.append(str(e)[:160]))
                pg.goto(base + page_name, wait_until='domcontentloaded'); pg.wait_for_timeout(400)
                m = pg.evaluate('''() => { const d=document.documentElement; const bad=[];
                  document.querySelectorAll('body *').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width>0 && r.right>d.clientWidth+1 && getComputedStyle(e).position!=='fixed' && !e.closest('[style*="overflow"]')) bad.push((e.id||e.className||e.tagName).toString().slice(0,40));});
                  return {scrollW:d.scrollWidth, clientW:d.clientWidth, offenders:[...new Set(bad)].slice(0,5)} }''')
                results.append({'page': page_name, 'width': w, 'overflow': m['scrollW'] > m['clientW'] + 1,
                                'scrollW': m['scrollW'], 'offenders': m['offenders'], 'local_failures': local_fail, 'js_errors': errors})
                ctx.close()
        b.close()
    srv.shutdown()
    out = sys.argv[1] if len(sys.argv) > 1 else None
    if out: json.dump(results, open(out, 'w'), indent=1)
    ov = [r for r in results if r['overflow']]
    print(f'{len(results)} page/width combos checked; overflow: {len(ov)}')
    for r in ov[:12]: print('  OVERFLOW', r['page'], r['width'], r['scrollW'], r['offenders'])
    lf = sorted({f for r in results for f in r['local_failures']})
    print('local request failures:', lf or 'none')
    errs = sorted({e for r in results for e in r['js_errors']})
    print('uncaught JS errors:', errs or 'none')

main()
