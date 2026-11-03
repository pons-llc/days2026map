import re, json, sys, html
src = open(sys.argv[1], encoding='utf-8').read()
out = []
for m in re.finditer(r'"code([^"]+)": \{\s*code: "([^"]+)",(.*?)tmpLarge: \(function \(\) \{/\*(.*?)\*/\}', src, re.S):
    code, body = m.group(2), m.group(4)
    def g(p):
        r = re.search(p, body, re.S); return r.group(1).strip() if r else ''
    time = g(r'<li class="time">(.*?)</li>')
    tm = re.search(r'(\d+)月(\d+)日.*?(\d+:\d+)\s*-\s*(\d+:\d+)', time)
    if not tm: continue
    def clean(s): return html.unescape(re.sub(r'<[^>]+>','',re.sub(r'<br\s*/?>','\n',s))).strip()
    vid = g(r'session/view/(\d+)')
    cats = [c.strip() for c in clean(g(r'<ul class="session-category"[^>]*>(.*?)</ul>')).split('\n') if c.strip()]
    out.append(dict(id=code, viewId=vid, date=f"2026-{int(tm.group(1)):02d}-{int(tm.group(2)):02d}",
        start=tm.group(3).zfill(5), end=tm.group(4).zfill(5),
        title=clean(g(r'<h4 class="session-title">(.*?)</h4>')),
        note=clean(g(r'<p class="session-note">(.*?)</p>')),
        speakers=[s for s in (clean(g(r'<p class="session-company">(.*?)</p>'))+'\n'+clean(g(r'<p class="session-name">(.*?)</p>'))).split('\n') if s.strip()],
        cats=cats))
seen=set(); res=[]
for s in out:
    if s['id'] in seen: continue
    seen.add(s['id']); res.append(s)
res.sort(key=lambda s:(s['date'],s['start'],s['id']))
json.dump(res, open(sys.argv[2],'w',encoding='utf-8'), ensure_ascii=False, indent=1)
for s in res: print(s['id'], s['date'], s['start'], s['end'], s['title'][:40], s['cats'])
