"""Keep assets/opt/ in sync with the live board/popup feeds.

For every image the popup feed currently lists (all countries, notices/promotions/events),
make sure a 720px-wide WebP variant exists under assets/opt/<basename>.webp. The homepage
widget and the popup client try that variant first and fall back to the original, so a
missing variant is never an error, only slower. Also rewrites assets/opt/manifest.json
(original URL -> variant record) and assets/opt/index.json (sorted variant basenames, read by
the popup client so it can skip the lookup for images that have no variant yet).

usage: python -I scripts/sync-board-images.py [--dry-run]
needs: Pillow (pip install pillow)
"""
import io, json, os, re, sys, time, urllib.request, urllib.error
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPT = os.path.join(ROOT, 'assets', 'opt')
FEEDS = [u for u in os.environ.get('BB_FEED_BASES', 'https://bb-popup-feed.pages.dev,https://beautyblossom-popup-feed.beautyblossom.workers.dev').split(',') if u]
COUNTRIES = ['KO', 'EN', 'JP', 'CN', 'TW', 'TH', 'HK']
KINDS = ['notices', 'promotions', 'events']
MAX_W = 720
QUALITY = 80
UA = 'bb-board-image-sync/1 (+https://github.com/byeonghoyoo/beautyblossom-main-redesign-demo)'
NAME_RE = re.compile(r'/([^/?#]+)\.(?:png|jpe?g|webp|gif)(?:[?#].*)?$', re.I)
dry = '--dry-run' in sys.argv

def get(url, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def feed(country, kind):
    last = None
    for base in FEEDS:
        try:
            data = json.loads(get(f'{base}/{kind}?country={country}', 25).decode('utf-8'))
            if data.get('country') == country and data.get('kind') == kind and isinstance(data.get('items'), list):
                return data['items']
        except Exception as e:  # try the next base
            last = e
    print(f'  feed unavailable {country}/{kind}: {last}')
    return []

def convert(raw):
    im = Image.open(io.BytesIO(raw))
    im.load()
    orig = im.size
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'transparency' in im.info or im.mode in ('P', 'LA') else 'RGB')
    if im.size[0] > MAX_W:
        im = im.resize((MAX_W, max(1, round(im.size[1] * MAX_W / im.size[0]))), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, 'WEBP', quality=QUALITY, method=6)
    return orig, im.size, out.getvalue()

manifest_path = os.path.join(OPT, 'manifest.json')
manifest = json.load(open(manifest_path, encoding='utf-8')) if os.path.exists(manifest_path) else {}
existing = {f[:-5] for f in os.listdir(OPT) if f.endswith('.webp')}
wanted = {}
for country in COUNTRIES:
    for kind in KINDS:
        for item in feed(country, kind):
            url = item.get('image') or ''
            m = NAME_RE.search(url)
            if m and url.startswith('https://'):
                wanted.setdefault(m.group(1), url)
print(f'feed images {len(wanted)} | variants on disk {len(existing)}')

added = []
for name, url in sorted(wanted.items()):
    if name in existing:
        continue
    try:
        raw = get(url)
        orig, size, data = convert(raw)
    except Exception as e:
        print(f'  skip {name}: {e}')
        continue
    added.append(name)
    print(f'  + {name}.webp {orig[0]}x{orig[1]} {len(raw)}B -> {size[0]}x{size[1]} {len(data)}B  ({url})')
    if not dry:
        with open(os.path.join(OPT, name + '.webp'), 'wb') as f:
            f.write(data)
        manifest[url] = {'file': name + '.webp', 'orig': [orig[0], orig[1], len(raw)], 'opt': [size[0], size[1], len(data)]}
    time.sleep(0.3)

if not dry:
    names = sorted(f[:-5] for f in os.listdir(OPT) if f.endswith('.webp'))
    json.dump(manifest, open(manifest_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({'v': 1, 'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'names': names},
              open(os.path.join(OPT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'added {len(added)}' + (' (dry run)' if dry else ''))
