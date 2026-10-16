"""Genera src/lib/temasOscuroColores.css: la traducción al modo oscuro de
todas las familias de color de Tailwind (tintes 50-200, textos 700-950,
bordes y anillos claros) con sus variantes de estado.
Uso (desde lextech-erp/frontend): python scripts/generar_modo_oscuro.py ."""
import os, sys

root = sys.argv[1]
O = 'html[data-modo="oscuro"]'

# rgb del tono 500 (para los tintes) y el texto claro y apagado que se lee
# sobre gris oscuro (>= 4.5:1 sobre #1a1d22 y sobre el propio tinte).
FAMILIAS = {
    'red':     ('239 68 68',   '#f08a8a'),
    'rose':    ('244 63 94',   '#f19aac'),
    'pink':    ('236 72 153',  '#ee9ccb'),
    'fuchsia': ('217 70 239',  '#e3a1f0'),
    'purple':  ('168 85 247',  '#c9a8f5'),
    'violet':  ('139 92 246',  '#b9a8f7'),
    'indigo':  ('99 102 241',  '#a9b0f5'),
    'blue':    ('59 130 246',  '#9ab8f6'),
    'sky':     ('14 165 233',  '#86c8ee'),
    'cyan':    ('6 182 212',   '#7fd0df'),
    'teal':    ('20 184 166',  '#74cfc2'),
    'emerald': ('16 185 129',  '#6cc9a1'),
    'green':   ('34 197 94',   '#7fcf98'),
    'lime':    ('132 204 22',  '#b5d77a'),
    'yellow':  ('234 179 8',   '#e3c35a'),
    'amber':   ('245 158 11',  '#e3b75a'),
    'orange':  ('249 115 22',  '#eda26e'),
}
TINTE = {'50': 0.07, '100': 0.10, '200': 0.16}
TINTE_HOVER = {'50': 0.10, '100': 0.14, '200': 0.20}
OPACIDADES = ['', '/50', '/60', '/70', '/80', '/90']

def esc(c):
    return c.replace(':', '\\:').replace('/', '\\/').replace('.', '\\.').replace('[', '\\[').replace(']', '\\]').replace('#', '\\#')

def sel(variante, clase):
    """Selector de una clase de Tailwind con su variante de estado."""
    nombre = esc(variante + clase)
    if variante == '':
        return f'{O} .{nombre}'
    if variante == 'hover:':
        return f'{O} .{nombre}:hover'
    if variante == 'group-hover:':
        return f'{O} .group:hover .{nombre}'
    if variante == 'focus:':
        return f'{O} .{nombre}:focus'
    if variante == 'focus-within:':
        return f'{O} .{nombre}:focus-within'
    if variante == 'file:':
        return f'{O} .{nombre}::file-selector-button'
    if variante == 'group-hover/file:':
        return f'{O} .group\\/file:hover .{nombre}'
    raise ValueError(variante)

# Clases que aparecen en el código: de las variantes poco comunes (estados,
# opacidades) solo se generan esas; las básicas de cada color, siempre.
import re
usadas = set()
for dp, _, fs in os.walk(os.path.join(root, 'src')):
    for f in fs:
        if f.endswith(('.tsx', '.ts')):
            usadas.update(re.findall(r'[A-Za-z0-9:/\[\]#._-]+', open(os.path.join(dp, f), encoding='utf8').read()))
BASICA = re.compile(r'^(bg-[a-z]+-(50|100|200)|text-[a-z]+-(700|800|900)|border-[a-z]+-(100|200)|hover:bg-[a-z]+-(50|100))$')

def clase_de(selector):
    """La clase de Tailwind (sin escapar) de un selector generado por sel()."""
    m = re.search(r' \.((?:\\.|[^\s.])+?)(?::hover|:focus|:focus-within|::file-selector-button)?(?:\s|$)', selector[len(O):] + ' ')
    return m.group(1).replace('\\', '') if m else None

reglas = []
def regla(selectores, decl):
    vivos = []
    for x in selectores:
        base = x.replace(f'{O} .group:hover', O).split(' > ')[0]
        c = clase_de(base)
        if c is None or c in usadas or BASICA.match(c):
            vivos.append(x)
    if vivos:
        reglas.append(',\n'.join(vivos) + f' {{ {decl} !important; }}')

for fam, (rgb, texto) in FAMILIAS.items():
    # Fondos suaves: un tinte del color sobre la superficie oscura
    for tono, alfa in TINTE.items():
        s = [sel('', f'bg-{fam}-{tono}{o}') for o in OPACIDADES]
        s += [sel(v, f'bg-{fam}-{tono}') for v in ('focus:', 'file:')]
        regla(s, f'background-color: rgb({rgb} / {alfa})')
        s = [sel('hover:', f'bg-{fam}-{tono}{o}') for o in OPACIDADES] + [sel(v, f'bg-{fam}-{tono}') for v in ('group-hover:', 'group-hover/file:')]
        regla(s, f'background-color: rgb({rgb} / {TINTE_HOVER[tono]})')
    # Degradados claros de color: el mismo tinte liso
    s = [f'{O} [class*="from-{fam}-{t}"]' for t in ('50', '100', '200') if f'from-{fam}-{t}' in usadas]
    if s: reglas.append(',\n'.join(s) + f' {{ background-image: none !important; background-color: rgb({rgb} / 0.10) !important; }}')
    # Textos oscuros (pensados para fondo blanco): su versión clara
    s = [sel(v, f'text-{fam}-{t}{o}') for v in ('',) for t in ('700', '800', '900', '950') for o in ('', '/80', '/90')]
    s += [sel(v, f'text-{fam}-{t}') for v in ('hover:', 'group-hover:') for t in ('600', '700', '800', '900')]
    if fam == 'red':
        # el rojo de marca sigue al tema; el de peligro se queda rojo (abajo)
        regla(s, 'color: var(--tema-acento)')
    else:
        regla(s, f'color: {texto}')
    # Bordes y anillos claros: gris (el color va en el texto o el icono)
    s = [sel(v, f'{p}-{fam}-{t}{o}') for p in ('border', 'divide') for v in ('', 'hover:', 'group-hover:') for t in ('100', '200', '300') for o in ('', '/60', '/70', '/80')]
    regla([x + (' > * + *' if '.divide' in x else '') for x in s], 'border-color: var(--o-borde)')
    s = [sel(v, f'ring-{fam}-{t}') for v in ('', 'hover:', 'focus:', 'focus-within:') for t in ('100', '200', '300')]
    regla(s, f'--tw-ring-color: rgb({rgb} / 0.35)')

# Lo de peligro: siempre rojo (también en hover)
s = [f'{O} .peligro{x}' for x in ('.text-red-700', '.text-red-800', '.text-red-900', ' .text-red-700', ' .text-red-800', ' .text-red-900',
                                    '.hover\\:text-red-700:hover', ' .hover\\:text-red-700:hover', '.hover\\:text-red-800:hover', ' .hover\\:text-red-800:hover')]
regla(s, 'color: #f08a8a')

# Neutros que faltaban: estados (focus, group-hover), opacidades y grises "neutral"/"zinc"
blancos = [sel(v, 'bg-white') for v in ('focus:', 'focus-within:', 'group-hover:')] + [sel('', f'bg-white/{o}') for o in ('60', '70')] \
    + [sel('hover:', f'bg-white/{o}') for o in ('60', '70', '90')]
regla(blancos, 'background-color: var(--o-elevado)')
regla([sel(v, f'bg-{g}-{t}') for g in ('neutral', 'zinc', 'stone') for t in ('50',) for v in ('',)], 'background-color: var(--o-fondo)')
regla([sel(v, f'bg-{g}-{t}') for g in ('neutral', 'zinc', 'stone') for t in ('100', '200') for v in ('', 'hover:')], 'background-color: var(--o-elevado)')
regla([sel(v, f'{p}-{g}-{t}{o}') for p in ('border', 'divide') for g in ('slate', 'gray', 'neutral', 'zinc') for t in ('100', '200') for v in ('', 'hover:', 'group-hover:')
       for o in ('', '/50', '/60', '/80')] + [sel('', f'border-{g}-50') for g in ('neutral', 'zinc')],
      'border-color: var(--o-borde)')
regla([sel(v, f'ring-{g}-{t}{o}') for g in ('slate', 'gray') for t in ('100', '200') for v in ('', 'focus:') for o in ('', '/50')], '--tw-ring-color: var(--o-borde)')
regla([sel(v, f'text-{g}-{t}') for g in ('neutral', 'zinc', 'gray', 'slate') for t in ('700', '800', '900') for v in ('hover:', 'group-hover:')], 'color: var(--o-texto)')
regla([sel('', f'text-{g}-{t}') for g in ('zinc', 'stone') for t in ('700', '800', '900')], 'color: var(--o-texto-2)')
# Rojo de marca puesto con su código (#ab0433 y su versión oscura)
regla([sel(v, f'text-[{h}]') for v in ('hover:', 'group-hover:') for h in ('#ab0433', '#92042c', '#8f0329')], 'color: var(--tema-acento)')
# Colores claros a medida (hex) de Clientes, Expedientes, Agenda y Correo
regla([sel('', f'bg-[{h}]') for h in ('#fbfcfe', '#f8fafc', '#f5f9ff', '#f4fcf5', '#fffdf5', '#f0f4f8', '#eef2f6')], 'background-color: var(--o-superficie)')
regla([sel('', f'bg-[{h}]') for h in ('#f3f6fb', '#f6f8fc', '#fafafa')], 'background-color: var(--o-fondo)')
regla([sel('', f'bg-[{h}]') for h in ('#dbe5f1', '#f0f2f5')] + [sel('', 'bg-slate-200/70')], 'background-color: var(--o-elevado)')
regla([sel('', f'border-[{h}]') for h in ('#d9e1ea', '#e2e8f0', '#e5e7eb', '#cfd8e3')], 'border-color: var(--o-borde)')
# Anillo del color del fondo de la página (nodos de la línea de Trazabilidad)
regla([sel('', 'border-[#f4f6f8]')], 'border-color: var(--o-fondo)')
# Separadores en degradado (chat): del color de los bordes
# Grises medios (interruptores apagados, barras de progreso vacías)
regla([sel(v, f'bg-{g}-300{o}') for g in ('slate', 'gray') for v in ('', 'hover:') for o in ('', '/70')], 'background-color: var(--o-borde-fuerte)')
# Aro blanco de contadores y avatares: del color de la superficie
regla([sel('', f'ring-white')], '--tw-ring-color: var(--o-superficie)')
# Bloques de color vivo con texto blanco (eventos de la Agenda con su color,
# barras del Gantt, contadores): una capa oscura sobre el fondo, que apaga el
# color sin tocar el texto. En oscuro no deslumbran y el blanco se lee mejor.
vivos = ','.join(f'[class*="bg-{f}-500"]' for f in FAMILIAS)
# No en botones ni enlaces: los botones principales mantienen su color.
NB = ':not(button, a, [role="button"], label)'
reglas.append(f'{O} .text-white[style*="background-color"]{NB},\n{O} .text-white:is({vivos}){NB} {{ background-image: linear-gradient(rgb(0 0 0 / 0.28), rgb(0 0 0 / 0.28)) !important; }}')
reglas.append(f'{O} .text-white[style*="background-color"] :is(.text-white\\/75, .text-white\\/80),\n{O} .text-white:is({vivos}) :is(.text-white\\/75, .text-white\\/80),\n'
              f'{O} :is(.text-white\\/75, .text-white\\/80):is([style*="background-color"] *) {{ color: rgb(255 255 255 / 0.92) !important; }}')
# Rejilla del mes de la Agenda (index.css le pone sus propios claros)
reglas.append(f'''{O} .agenda-google-grid {{ background: var(--o-fondo) !important; border-right-color: var(--o-borde) !important; }}
{O} .agenda-google-grid > .grid:first-child {{ background: var(--o-superficie) !important; border-bottom-color: var(--o-borde) !important; }}
{O} .agenda-google-grid > .grid:first-child > div {{ color: var(--o-texto-3) !important; }}
{O} .agenda-google-grid .grid.grid-cols-7.auto-rows-fr > div {{ background: var(--o-superficie) !important; border-right-color: var(--o-borde) !important; border-bottom-color: var(--o-borde) !important; }}
{O} .agenda-google-grid .grid.grid-cols-7.auto-rows-fr > div:hover {{ background: var(--o-elevado) !important; }}
{O} .agenda-google-grid .grid.grid-cols-7.auto-rows-fr > div .text-slate-600 {{ color: var(--o-texto-2) !important; }}
{O} .agenda-google-grid .grid.grid-cols-7.auto-rows-fr > div :is(.text-slate-400, .text-slate-300) {{ color: var(--o-texto-4) !important; }}
{O} .agenda-google-grid .grid.grid-cols-7.auto-rows-fr > div :is(.text-red-600, .hover\\:text-red-500:hover) {{ color: var(--tema-acento) !important; }}
{O} .agenda-google-grid .grid.grid-cols-7.auto-rows-fr > div .rounded.text-\\[10px\\] {{ background: var(--o-elevado) !important; color: var(--o-texto) !important; border-color: var(--o-borde) !important; box-shadow: none !important; }}
{O} .agenda-google-grid .grid.grid-cols-7.auto-rows-fr > div .text-blue-700 {{ color: #9ab8f6 !important; }}
{O} .agenda-google-shell, {O} .agenda-google-body {{ background: var(--o-fondo) !important; color: var(--o-texto) !important; }}
{O} .agenda-google-topbar {{ background: var(--o-superficie) !important; border-bottom-color: var(--o-borde) !important; }}
{O} .agenda-google-topbar h1, {O} .agenda-google-topbar > div:last-child > div:first-child span {{ color: var(--o-texto) !important; }}
{O} .agenda-google-topbar p, {O} .agenda-google-topbar > div:last-child > div:first-child button {{ color: var(--o-texto-3) !important; }}
{O} .agenda-google-topbar > div:last-child > button:not(.bg-red-600), {O} .agenda-google-topbar > div:last-child > div, {O} .agenda-google-topbar > div:last-child > span {{ background: var(--o-elevado) !important; border-color: var(--o-borde) !important; color: var(--o-texto-2) !important; box-shadow: none !important; }}
{O} .agenda-google-topbar > div:last-child > div:first-child {{ background: transparent !important; border-color: transparent !important; }}
{O} .agenda-google-topbar > div:last-child > button:not(.bg-red-600):hover, {O} .agenda-google-topbar > div:last-child > div:first-child button:hover {{ background: var(--o-borde) !important; color: var(--o-texto) !important; }}
{O} .agenda-google-topbar .bg-white.border-emerald-200 {{ background: var(--o-elevado) !important; border-color: var(--o-borde) !important; }}
{O} .agenda-google-topbar .text-emerald-700 {{ color: #6cc9a1 !important; }}
{O} .agenda-google-topbar .bg-red-50 {{ background: rgba(var(--tema-rgb), 0.12) !important; border-color: var(--o-borde) !important; color: var(--tema-acento) !important; }}
{O} .agenda-google-topbar .bg-emerald-50 {{ background: rgb(16 185 129 / 0.10) !important; border-color: var(--o-borde) !important; color: #6cc9a1 !important; }}
{O} .agenda-google-sidebar {{ background: var(--o-superficie) !important; border-right-color: var(--o-borde) !important; }}
{O} .agenda-google-sidebar > div:first-child, {O} .agenda-google-sidebar > div:nth-child(2), {O} .agenda-google-sidebar > div:nth-child(3) {{ border-bottom-color: var(--o-borde) !important; }}
{O} .agenda-google-sidebar > div:first-child button {{ background: var(--o-elevado) !important; border-color: var(--o-borde) !important; color: var(--o-texto) !important; box-shadow: none !important; }}
{O} .agenda-google-sidebar > div:first-child button:hover {{ background: var(--o-borde) !important; }}
{O} .agenda-google-sidebar :is(.text-slate-800, .text-slate-700) {{ color: var(--o-texto) !important; }}
{O} .agenda-google-sidebar :is(.text-slate-400, .text-slate-500) {{ color: var(--o-texto-3) !important; }}
{O} .agenda-google-sidebar :is(.border-slate-100, .border-slate-200, .border-blue-100) {{ border-color: var(--o-borde) !important; }}
{O} .agenda-google-sidebar .text-red-500 {{ color: var(--tema-acento) !important; }}
{O} .agenda-google-sidebar :is(.rounded-xl.border, .rounded-xl.border-blue-100) {{ background: var(--o-elevado) !important; }}
{O} .document-upload-sheet::before {{ background: var(--o-borde-fuerte) !important; }}
{O} .document-upload-glow {{ background: none !important; }}
{O} .agenda-google-sidebar .text-blue-800 {{ color: #9ab8f6 !important; }}
{O} .agenda-google-sidebar :is(.text-blue-500, .text-blue-400) {{ color: #9ab8f6 !important; }}''')
for lado in ('r', 'l'):
    reglas.append(f'{O} .bg-gradient-to-{lado}[class*="via-slate-200"] {{ background-image: linear-gradient(to {"right" if lado == "r" else "left"}, transparent, var(--o-borde)) !important; }}')

cabecera = """/* ══════════════════════════════════════════════════════════════════════════
   Modo oscuro: todas las familias de color (16/10/2026)
   GENERADO -- no editar a mano: python scripts/generar_modo_oscuro.py . (desde frontend/)
   temasExtra.css traduce los grises y los colores básicos; esto completa el
   resto para que nada se quede claro sobre fondo oscuro:
   - Fondos suaves (tonos 50-200, también con opacidad, hover y focus): un
     tinte del propio color sobre la superficie oscura.
   - Textos oscuros (700-950, y sus hover): la versión clara y apagada del
     color, legible sobre gris oscuro (>= 4,5:1).
   - Bordes y anillos claros: gris, como el resto del modo oscuro.
   - Los colores a medida (#f8fafc, #eef2f6...) que usan algunas pantallas.
   ══════════════════════════════════════════════════════════════════════════ */
"""
out = os.path.join(root, 'src/lib/temasOscuroColores.css')
open(out, 'w', encoding='utf8', newline='\n').write(cabecera + '\n'.join(reglas) + '\n')
print(out, len(reglas), 'reglas', os.path.getsize(out), 'bytes')
