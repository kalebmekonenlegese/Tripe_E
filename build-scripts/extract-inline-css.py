import html
import pathlib
import re


ROOT = pathlib.Path(__file__).resolve().parents[1]
STYLE_PATH = ROOT / 'assets' / 'css' / 'styles.css'
STYLE_BLOCK_MARKER = '/* Extracted page styles */'


def add_class(tag, class_name):
    class_match = re.search(r'\bclass=(["\'])(.*?)\1', tag, re.IGNORECASE | re.DOTALL)
    if class_match:
        classes = f'{class_match.group(2)} {class_name}'.strip()
        return tag[:class_match.start(2)] + classes + tag[class_match.end(2):]
    return tag[:-1] + f' class="{class_name}">'


def main():
    declarations = {}
    extracted_blocks = []

    for page in sorted(ROOT.glob('*.html')):
        text = page.read_text(encoding='utf-8')
        blocks = re.findall(r'<style\b[^>]*>(.*?)</style>', text, re.IGNORECASE | re.DOTALL)
        if blocks:
            extracted_blocks.extend(block.strip() for block in blocks if block.strip())
            text = re.sub(r'\s*<style\b[^>]*>.*?</style>\s*', '\n', text, flags=re.IGNORECASE | re.DOTALL)

        def replace_tag(match):
            tag = match.group(0)
            style_match = re.search(r"\sstyle=([\"'])(.*?)\1", tag, re.IGNORECASE | re.DOTALL)
            if not style_match:
                return tag
            declaration = html.unescape(style_match.group(2)).strip()
            class_name = declarations.setdefault(declaration, f'inline-style-{len(declarations) + 1:03d}')
            tag = tag[:style_match.start()] + tag[style_match.end():]
            return add_class(tag, class_name)

        updated = re.sub(r'<[a-zA-Z][^>]*>', replace_tag, text, flags=re.DOTALL)
        if updated != page.read_text(encoding='utf-8'):
            page.write_text(updated, encoding='utf-8')

    css = STYLE_PATH.read_text(encoding='utf-8')
    if STYLE_BLOCK_MARKER not in css and extracted_blocks:
        css += f'\n\n{STYLE_BLOCK_MARKER}\n' + '\n\n'.join(extracted_blocks) + '\n'
    if declarations:
        if '/* Extracted inline declarations */' not in css:
            css += '\n\n/* Extracted inline declarations */\n'
        css += ''.join(f'.{class_name} {{ {declaration} }}\n' for declaration, class_name in declarations.items())
    STYLE_PATH.write_text(css, encoding='utf-8')
    print(f'EXTRACTED_STYLE_ATTRIBUTES: {len(declarations)}')
    print(f'EXTRACTED_STYLE_BLOCKS: {len(extracted_blocks)}')


if __name__ == '__main__':
    main()