#!/usr/bin/env python3
"""Baut Clipwerk Studio zu einer einzigen HTML-Datei zusammen."""
import pathlib, sys
root = pathlib.Path(__file__).parent
src = root / 'src'
mb = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'vendor' / 'mediabunny.min.cjs'
html = (src / 'index.html').read_text(encoding='utf-8')
css = (src / 'style.css').read_text(encoding='utf-8')
js = '\n'.join(p.read_text(encoding='utf-8') for p in sorted((src / 'js').glob('*.js')))
lib = mb.read_text(encoding='utf-8').replace('</script', '<\\/script')
assert '</script' not in js
html = html.replace('/*CSS*/', css).replace('/*MEDIABUNNY*/', '/* Mediabunny (MPL-2.0) – https://mediabunny.dev */\n' + lib).replace('/*JS*/', js)
out = root / 'dist' / 'Clipwerk-Studio.html'
out.write_text(html, encoding='utf-8')
print(out, round(out.stat().st_size / 1024), 'KB')
