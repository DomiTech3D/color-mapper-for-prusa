#!/usr/bin/env python3
# Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
# SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md
"""Build the Color Mapper for Prusa page.

Inserts core.js and the sample model into app/index.src.html and writes:
  dist/color-mapper.html        standalone page – open it in any current browser
  desktop/web/color-mapper.html the same page, built into the Windows program

Optional environment variables:
  REPO_URL   link to the repository, shown in the page footer
             (default: the original project; the GitHub workflows set it to the repository they run in)
"""
import argparse, base64, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def path(*p):
    return os.path.join(ROOT, *p)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--demo', default=path('demo', 'benchy_8t.3mf'), help='sample 3MF shown on start')
    ap.add_argument('--fragment', help='also write the page without <html>/<head> (for embedding)')
    a = ap.parse_args()

    src = open(path('app', 'index.src.html'), encoding='utf-8').read()
    core = open(path('app', 'core.js'), encoding='utf-8').read()
    core = core.replace("if (typeof module !== 'undefined' && module.exports) module.exports = coreFactory;", '')
    demo = base64.b64encode(open(a.demo, 'rb').read()).decode()
    assert '/*__CORE__*/' in src and "/*__DEMO__*/''" in src and '/*__REPO__*/' in src
    page = (src.replace('/*__CORE__*/', core)
               .replace("/*__DEMO__*/''", json.dumps(demo))
               .replace('/*__REPO__*/', os.environ.get('REPO_URL', 'https://github.com/DomiTech3D/color-mapper-for-prusa')))
    full = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n'
            '</head>\n<body>\n' + page + '\n</body>\n</html>\n')
    for out in (path('dist', 'color-mapper.html'), path('desktop', 'web', 'color-mapper.html')):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w', encoding='utf-8').write(full)
        print('wrote', os.path.relpath(out, ROOT), f'({len(full) / 1048576:.1f} MB)')
    if a.fragment:
        open(a.fragment, 'w', encoding='utf-8').write(page)
        print('wrote', a.fragment)


if __name__ == '__main__':
    main()
