import re, sys
src_path, out_path, title = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(src_path, encoding='utf-8').read()
head = src.split('<body>')[0]
links = ''.join(re.findall(r'<link [^>]*fonts\.(?:googleapis|gstatic)[^>]*>', head))
styles = ''.join(re.findall(r'<style[^>]*>.*?</style>', src, re.S))
scripts = re.findall(r'<script type="module"[^>]*>.*?</script>', src, re.S)
assert len(scripts) == 1, len(scripts)
script = scripts[0].replace(' crossorigin', '')
frag = (f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + links + '\n' + styles +
        f'\n<div id="root"><div class="loading" role="status">Loading the {title}...</div></div>\n' + script + '\n')
open(out_path, 'w', encoding='utf-8').write(frag)
print(out_path, len(frag.encode()), 'bytes; en-dash outside bundle:', '–' in frag.replace(script, ''))
