#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io, base64
from zipfile import ZipFile
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ─── Helpers de namespace y color ────────────────────────────────────────────
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

def wattr(elem, name, default=None):
    """Lee un atributo w:name usando el URI completo (necesario en ElementTree)."""
    return elem.get(f'{{{W_NS}}}{name}', default)

# -*- coding: utf-8 -*-
import sys, io, base64
from zipfile import ZipFile
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ─── Helpers de namespace y color ────────────────────────────────────────────
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

def wattr(elem, name, default=None):
    """Lee un atributo w:name usando el URI completo (necesario en ElementTree)."""
    return elem.get(f'{{{W_NS}}}{name}', default)

# Cache de colores del tema del documento actual
_theme_colors = {}

def load_theme_colors(docx):
    """Carga la paleta de colores de word/theme/theme1.xml en _theme_colors."""
    global _theme_colors
    _theme_colors = {}
    try:
        theme_xml = docx.read('word/theme/theme1.xml').decode('utf-8')
        root_t = ET.fromstring(theme_xml.encode('utf-8'))
        AN = 'http://schemas.openxmlformats.org/drawingml/2006/main'
        color_map = {
            'dark1':'dk1','light1':'lt1','dark2':'dk2','light2':'lt2',
            'accent1':'accent1','accent2':'accent2','accent3':'accent3',
            'accent4':'accent4','accent5':'accent5','accent6':'accent6',
            'hyperlink':'hlink','followedHyperlink':'folHlink',
        }
        clr_scheme = root_t.find(f'.//{{{AN}}}clrScheme')
        if clr_scheme is None: return
        for w_name, a_name in color_map.items():
            el = clr_scheme.find(f'{{{AN}}}{a_name}')
            if el is None: continue
            srgb = el.find(f'{{{AN}}}srgbClr')
            if srgb is not None:
                _theme_colors[w_name] = srgb.get('val', '000000'); continue
            sys_clr = el.find(f'{{{AN}}}sysClr')
            if sys_clr is not None:
                _theme_colors[w_name] = sys_clr.get('lastClr', '000000')
    except:
        pass

def _apply_tint_shade(hex6, tint=None, shade=None):
    """Aclara (tint) u oscurece (shade) un color hex de 6 dígitos (valores 0-FF)."""
    try:
        r, g, b = int(hex6[0:2],16), int(hex6[2:4],16), int(hex6[4:6],16)
        if tint is not None:
            t = int(tint, 16) / 255.0
            r = int(r + (255-r)*(1-t)); g = int(g + (255-g)*(1-t)); b = int(b + (255-b)*(1-t))
        if shade is not None:
            s = int(shade, 16) / 255.0
            r = int(r*s); g = int(g*s); b = int(b*s)
        clamp = lambda v: max(0, min(255, v))
        return f'{clamp(r):02X}{clamp(g):02X}{clamp(b):02X}'
    except:
        return hex6

def resolve_clr(elem):
    """Resuelve w:themeColor+Tint/Shade o w:val a un color CSS #RRGGBB."""
    theme_color = wattr(elem, 'themeColor')
    tint        = wattr(elem, 'themeTint')
    shade_v     = wattr(elem, 'themeShade')
    val         = wattr(elem, 'val')
    if theme_color and theme_color in _theme_colors:
        hex6 = _theme_colors[theme_color]
        if tint or shade_v:
            hex6 = _apply_tint_shade(hex6, tint, shade_v)
        return f'#{hex6}'
    if val and val.lower() not in ('auto', 'none', ''):
        return f'#{val}'
    return None

_HIGHLIGHT = {
    'yellow':'#FFFF00','green':'#00FF00','cyan':'#00FFFF','magenta':'#FF00FF',
    'blue':'#0000FF','red':'#FF0000','darkBlue':'#000080','darkCyan':'#008080',
    'darkGreen':'#008000','darkMagenta':'#800080','darkRed':'#800000',
    'darkYellow':'#808000','darkGray':'#808080','lightGray':'#C0C0C0',
    'black':'#000000','white':'#FFFFFF',
}

def _is_on(elem):
    """Devuelve True si un elemento toggle (b, i, strike…) está activo."""
    v = wattr(elem, 'val', 'true').lower()
    return v not in ('false', '0', 'off')

def get_run_style(run, ns):
    """Extrae TODOS los estilos de un run con colores de tema, relleno, super/sub, etc."""
    style = {}
    rPr = run.find('w:rPr', ns)
    if not rPr: return style

    # ── Color de fuente ───────────────────────────────────────────────────────
    color_el = rPr.find('w:color', ns)
    if color_el is not None:
        c = resolve_clr(color_el)
        if c: style['color'] = c

    # ── Tamaño de fuente ──────────────────────────────────────────────────────
    for sz_tag in ('w:sz', 'w:szCs'):
        sz = rPr.find(sz_tag, ns)
        if sz is not None:
            try: style['font-size'] = f'{int(wattr(sz,"val","22"))//2}pt'; break
            except: pass

    # ── Familia de fuente ─────────────────────────────────────────────────────
    rFonts = rPr.find('w:rFonts', ns)
    if rFonts is not None:
        f = wattr(rFonts,'ascii') or wattr(rFonts,'hAnsi') or wattr(rFonts,'cs')
        if f: style['font-family'] = f'"{f}",sans-serif'

    # ── Negrita ───────────────────────────────────────────────────────────────
    b_el = rPr.find('w:b', ns)
    if b_el is not None and _is_on(b_el): style['font-weight'] = 'bold'

    # ── Cursiva ───────────────────────────────────────────────────────────────
    i_el = rPr.find('w:i', ns)
    if i_el is not None and _is_on(i_el): style['font-style'] = 'italic'

    # ── Subrayado ─────────────────────────────────────────────────────────────
    u = rPr.find('w:u', ns)
    if u is not None:
        uval = wattr(u, 'val', 'single')
        if uval and uval not in ('none','false','0'):
            style['text-decoration'] = 'underline double' if uval == 'double' else 'underline'

    # ── Tachado ───────────────────────────────────────────────────────────────
    deco = style.get('text-decoration', '')
    for st_tag in ('w:strike', 'w:dstrike'):
        st = rPr.find(st_tag, ns)
        if st is not None and _is_on(st):
            deco = (deco + ' line-through').strip()
    if deco: style['text-decoration'] = deco

    # ── Resaltado (highlight marker) ──────────────────────────────────────────
    hl = rPr.find('w:highlight', ns)
    if hl is not None:
        hval = wattr(hl, 'val')
        if hval in _HIGHLIGHT: style['background-color'] = _HIGHLIGHT[hval]

    # ── Relleno/sombreado del texto (w:shd en rPr) ───────────────────────────
    shd = rPr.find('w:shd', ns)
    if shd is not None:
        # Intentar resolver via themeColor/fill
        c = resolve_clr(shd)
        if not c:
            fill = wattr(shd, 'fill')
            if fill and fill.lower() not in ('auto', 'none', 'ffffff', ''):
                c = f'#{fill}'
        if c and 'background-color' not in style:
            style['background-color'] = c

    # ── Superíndice / Subíndice ───────────────────────────────────────────────
    va = rPr.find('w:vertAlign', ns)
    if va is not None:
        vval = wattr(va, 'val', '')
        if vval == 'superscript':
            style['vertical-align'] = 'super'; style['font-size'] = '75%'
        elif vval == 'subscript':
            style['vertical-align'] = 'sub'; style['font-size'] = '75%'

    # ── Versalitas / Mayúsculas ───────────────────────────────────────────────
    sc = rPr.find('w:smallCaps', ns)
    if sc is not None and _is_on(sc): style['font-variant'] = 'small-caps'
    caps = rPr.find('w:caps', ns)
    if caps is not None and _is_on(caps): style['text-transform'] = 'uppercase'

    # ── Espaciado entre caracteres ────────────────────────────────────────────
    sp_el = rPr.find('w:spacing', ns)
    if sp_el is not None:
        spval = wattr(sp_el, 'val')
        if spval:
            try: style['letter-spacing'] = f'{int(spval)/20:.1f}pt'
            except: pass

    return style

def para_to_html(para, ns, rels, images):
    """Convierte un párrafo a HTML con TODOS los estilos"""
    style = {}
    pPr = para.find('w:pPr', ns)

    if pPr:
        # Alineación
        jc = pPr.find('w:jc', ns)
        if jc is not None:
            align = wattr(jc, 'val')
            if align == 'center': style['text-align'] = 'center'
            elif align == 'right': style['text-align'] = 'right'
            elif align == 'both': style['text-align'] = 'justify'

        # Espacios y línea
        spacing = pPr.find('w:spacing', ns)
        if spacing is not None:
            before = wattr(spacing, 'before')
            after  = wattr(spacing, 'after')
            line   = wattr(spacing, 'line')
            try:
                if before: style['margin-top']    = f'{int(before)//100}px'
                if after:  style['margin-bottom'] = f'{int(after)//100}px'
                if line:   style['line-height']   = f'{int(line)/240:.2f}'
            except: pass

        # Indentación
        ind = pPr.find('w:ind', ns)
        if ind is not None:
            left  = wattr(ind, 'left')
            right = wattr(ind, 'right')
            hang  = wattr(ind, 'hanging')
            try:
                if left: style['margin-left']    = f'{int(left)//20}px'
                if right: style['margin-right']  = f'{int(right)//20}px'
                if hang: style['text-indent']    = f'-{int(hang)//20}px'
            except: pass

        # Fondo/Sombreado de párrafo
        shd = pPr.find('w:shd', ns)
        if shd is not None:
            c = resolve_clr(shd)
            if not c:
                fill = wattr(shd, 'fill')
                if fill and fill.lower() not in ('auto', 'none', ''):
                    c = f'#{fill}'
            if c: style['background-color'] = c

        # Bordes
        pBdr = pPr.find('w:pBdr', ns)
        if pBdr:
            top = pBdr.find('w:top', ns)
            if top: style['border-top'] = '1px solid #000'
            bottom = pBdr.find('w:bottom', ns)
            if bottom: style['border-bottom'] = '1px solid #000'

    html = '<p style="' + ';'.join([f'{k}:{v}' for k,v in style.items()]) + '">'

    for run in para.findall('.//w:r', ns):
        s = get_run_style(run, ns)
        css = ';'.join([f'{k}:{v}' for k,v in s.items()])

        for t in run.findall('.//w:t', ns):
            if t.text:
                txt = t.text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
                html += f'<span style="{css}">{txt}</span>' if css else txt

        # Imágenes (inline y anchor)
        for draw in run.findall('w:drawing', ns):
            for container in list(draw.findall('wp:inline', ns)) + list(draw.findall('wp:anchor', ns)):
                for blip in container.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                    e = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    if e and e in rels:
                        img_path = rels[e]
                        img_name = img_path.split('/')[-1]
                        if img_name in images:
                            data = images[img_name]
                            html += f'<img src="data:{data["mime"]};base64,{data["data"]}" style="max-width:100%;height:auto;margin:8px 0;border-radius:4px;display:block;"/>'

    html += '</p>'
    return html

def extract_text_from_element(element, ns, rels, images):
    """Extrae texto con formato MEJORADO (colores exactos, tamaños, etc) de un elemento XML"""
    html = ''
    for run in element.findall('.//w:r', ns):
        # Usar la función mejorada get_run_style
        s = get_run_style(run, ns)
        css = ';'.join([f'{k}:{v}' for k,v in s.items()])

        # Procesar texto
        for text_elem in run.findall('.//w:t', ns):
            if text_elem.text:
                text = text_elem.text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                if css.strip():
                    html += f'<span style="{css}">{text}</span>'
                else:
                    html += text

        # Procesar imágenes (inline y anchor)
        for drawing in run.findall('w:drawing', ns):
            for container in list(drawing.findall('wp:inline', ns)) + list(drawing.findall('wp:anchor', ns)):
                for blip in container.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                    embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    if embed and embed in rels:
                        img_path = rels[embed]
                        img_name = img_path.split('/')[-1]
                        if img_name in images:
                            img_data = images[img_name]
                            html += '<img src="data:' + img_data['mime'] + ';base64,' + img_data['data'] + '" style="max-width:100%;height:auto;margin:8px 0;border-radius:4px;display:block;"/>'
    return html

try:
    file_path = sys.argv[1]
    with ZipFile(file_path, 'r') as docx:
        # Leer XML del documento
        xml_content = docx.read('word/document.xml').decode('utf-8')
        root = ET.fromstring(xml_content.encode('utf-8'))

        # Namespaces (IMPORTANTE: incluir todos para procesar imágenes)
        ns = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
            'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
            'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'
        }

        # Cargar relaciones para mapear IDs de imágenes
        rels = {}
        try:
            rels_content = docx.read('word/_rels/document.xml.rels')
            rels_root = ET.fromstring(rels_content)
            for rel in rels_root.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                rel_id = rel.get('Id')
                target = rel.get('Target')
                rels[rel_id] = target
        except:
            pass

        # Cargar imágenes en memoria
        images = {}
        try:
            for item in docx.namelist():
                if item.startswith('word/media/'):
                    img_name = item.split('/')[-1]
                    img_data = docx.read(item)
                    img_b64 = base64.b64encode(img_data).decode('utf-8')
                    # Detectar tipo MIME
                    if img_name.lower().endswith('.png'):
                        mime = 'image/png'
                    elif img_name.lower().endswith('.jpg') or img_name.lower().endswith('.jpeg'):
                        mime = 'image/jpeg'
                    elif img_name.lower().endswith('.gif'):
                        mime = 'image/gif'
                    else:
                        mime = 'image/jpeg'
                    images[img_name] = {'data': img_b64, 'mime': mime}
        except:
            pass

        # Cargar colores del tema para resolución precisa
        load_theme_colors(docx)

        # Extraer encabezados y pies de página
        header_html = ''
        footer_html = ''

        # Buscar encabezados
        for i in range(1, 4):  # Típicamente hay hasta 3 encabezados
            try:
                header_content = docx.read(f'word/header{i}.xml').decode('utf-8')
                header_root = ET.fromstring(header_content.encode('utf-8'))
                for para in header_root.findall('.//w:p', ns):
                    text = extract_text_from_element(para, ns, rels, images)
                    if text.strip():
                        header_html += f'<p style="margin: 8px 0; padding: 10px 0; border-bottom: 1px solid #ddd; font-size: 10pt;">{text}</p>'
            except:
                pass

        # Buscar pies de página
        for i in range(1, 4):  # Típicamente hay hasta 3 pies
            try:
                footer_content = docx.read(f'word/footer{i}.xml').decode('utf-8')
                footer_root = ET.fromstring(footer_content.encode('utf-8'))
                for para in footer_root.findall('.//w:p', ns):
                    text = extract_text_from_element(para, ns, rels, images)
                    if text.strip():
                        footer_html += f'<p style="margin: 8px 0; padding: 10px 0; border-top: 1px solid #ddd; font-size: 10pt;">{text}</p>'
            except:
                pass

        # Procesar párrafos del documento
        html_content = []
        for para in root.findall('.//w:p', ns):
            html = para_to_html(para, ns, rels, images)
            # Incluir si tiene texto, spans, o imágenes — nunca filtrar párrafos con <img
            if html.count('<span') > 0 or html.count('<img') > 0 or any(c in html for c in ['áéíóúñ']):
                html_content.append(html)
            elif len(html) > len('<p style=""></p>') + 5:
                # Párrafo con contenido no vacío aunque no tenga span ni img
                html_content.append(html)

        html = '<?xml version="1.0" encoding="UTF-8"?><html><head><meta charset="UTF-8"><style>body { font-family: Calibri, Arial, sans-serif; color: #333; } .header { margin: 20px; border-bottom: 2px solid #ddd; padding-bottom: 15px; } .content { margin: 20px; line-height: 1.5; } .footer { margin: 20px; border-top: 2px solid #ddd; padding-top: 15px; } p { margin: 12px 0; } span { display: inline; }</style></head><body>'

        if header_html:
            html += '<div class="header">' + header_html + '</div>'

        html += '<div class="content">' + ''.join(html_content) + '</div>'

        if footer_html:
            html += '<div class="footer">' + footer_html + '</div>'

        html += '</body></html>'

        # Asegurar UTF-8 en salida
        print(html)
except Exception as e:
    import traceback
    error_msg = traceback.format_exc()
    print('<html><body style="background: #fff3cd;"><div style="padding: 20px; color: #856404;"><h3>Error al procesar</h3><pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">' + error_msg.replace('<', '&lt;').replace('>', '&gt;') + '</pre></div></body></html>')
