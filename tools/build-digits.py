#!/usr/bin/env python3
"""
Generate assets/js/mandatory-digits.js — the glyph outlines the landing page
uses to render the sign-up counter as live text.

Democratim's display face "Mandatory" has no web licence, so the font is never
shipped to the browser. Instead this script reads the licensed desktop font and
emits SVG outlines for twelve glyphs only (0-9, the comma and the percent
sign), with the brand
shear baked in exactly the way Figma bakes it into its own SVG exports. The
renderer in js/main.js composes those outlines into any number.

Usage:  python3 tools/build-digits.py [/path/to/MandatoryVariable.ttf]
"""
import json, os, re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    "~/Library/Fonts/MandatoryVariable.ttf")

SIZE  = 193.0                  # Figma font size on the counter
C, D  = 0.156434, 0.987688     # the brand shear Figma bakes into its exports
WGHT, WDTH = 900, 76           # "Black Condensed 29", fitted against number.svg
CHARS = "0123456789,%"      # digits + comma (counter) + percent (progress bar)

# The counter's baked number.svg, used to pin the coordinate frame and to verify.
REF_INK = (1.31, 0.00, 391.94, 156.50)
REF_VIEWBOX_W = 400.0

inst = instantiateVariableFont(TTFont(SRC), {"wght": WGHT, "wdth": WDTH}, inplace=False)
gs, cmap, hmtx = inst.getGlyphSet(), inst.getBestCmap(), inst["hmtx"]
scale = SIZE / inst["head"].unitsPerEm
names = {c: cmap[ord(c)] for c in CHARS}
adv   = {c: hmtx[names[c]][0] * scale for c in CHARS}
gname2char = {v: k for k, v in names.items()}


def xform(dx=0.0, dy=0.0):
    return Transform(scale, 0, -C * scale, -D * scale, dx, dy)


def bounds(ch, dx=0.0, dy=0.0):
    bp = BoundsPen(gs)
    gs[names[ch]].draw(TransformPen(bp, xform(dx, dy)))
    return bp.bounds


def kern_pairs():
    """Pull the 'kern' feature's PairPos values for our twelve glyphs."""
    out = {}
    if "GPOS" not in inst:
        return out
    table = inst["GPOS"].table
    want = set(names.values())
    idxs = set()
    for fr in table.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern":
            idxs.update(fr.Feature.LookupListIndex)

    def record(a, b, val):
        if val and a in gname2char and b in gname2char:
            out[gname2char[a] + gname2char[b]] = round(val * scale, 3)

    for i in idxs:
        for sub in table.LookupList.Lookup[i].SubTable:
            sub = sub.ExtSubTable if sub.LookupType == 9 else sub
            if getattr(sub, "Format", None) == 1:            # explicit pairs
                for first, ps in zip(sub.Coverage.glyphs, sub.PairSet):
                    if first not in want:
                        continue
                    for pv in ps.PairValueRecord:
                        if pv.SecondGlyph in want and pv.Value1:
                            record(first, pv.SecondGlyph, pv.Value1.XAdvance or 0)
            elif getattr(sub, "Format", None) == 2:           # class based
                c1 = sub.ClassDef1.classDefs
                c2 = sub.ClassDef2.classDefs
                for first in sub.Coverage.glyphs:
                    if first not in want:
                        continue
                    for second in want:
                        rec = sub.Class1Record[c1.get(first, 0)].Class2Record[c2.get(second, 0)]
                        if rec.Value1:
                            record(first, second, rec.Value1.XAdvance or 0)
    return out


KERN = kern_pairs()


def layout(text, dx=0.0, dy=0.0):
    """Pen positions for a string, honouring kerning."""
    pen, pos = 0.0, []
    for i, ch in enumerate(text):
        pos.append(pen + dx)
        pen += adv[ch]
        if i + 1 < len(text):
            pen += KERN.get(ch + text[i + 1], 0.0)
    return pos, pen


def ink(text, dx=0.0, dy=0.0):
    pos, total = layout(text, dx, dy)
    mnx = mny = 1e9
    mxx = mxy = -1e9
    for p, ch in zip(pos, text):
        b = bounds(ch, p, dy)
        if b:
            mnx, mny = min(mnx, b[0]), min(mny, b[1])
            mxx, mxy = max(mxx, b[2]), max(mxy, b[3])
    return mnx, mny, mxx, mxy, total


# Pin the coordinate frame so "17,185" reproduces number.svg exactly.
r = ink("17,185")
DX, DY = REF_INK[0] - r[0], REF_INK[1] - r[1]

v = ink("17,185", DX, DY)
err = (v[0] - REF_INK[0], v[1] - REF_INK[1], v[2] - REF_INK[2], v[3] - REF_INK[3])
print("verify '17,185' against number.svg")
print("  ink   x%.2f..%.2f y%.2f..%.2f" % (v[0], v[2], v[1], v[3]))
print("  figma x%.2f..%.2f y%.2f..%.2f" % (REF_INK[0], REF_INK[2], REF_INK[1], REF_INK[3]))
print("  error left %+.2f  top %+.2f  right %+.2f  bottom %+.2f" % err)
print("  advance width %.2f  (figma viewBox %.0f)" % (v[4], REF_VIEWBOX_W))
if max(abs(e) for e in err) > 1.0:
    sys.exit("ERROR: does not reproduce the Figma export within 1px")

num = re.compile(r"-?\d+\.\d+")
def tidy(d):
    return num.sub(lambda m: ("%.2f" % float(m.group())).rstrip("0").rstrip("."), d)

glyphs = {}
for ch in CHARS:
    pen = SVGPathPen(gs)
    gs[names[ch]].draw(TransformPen(pen, xform(DX, DY)))
    b = bounds(ch, DX, DY)
    glyphs[ch] = {
        "d": tidy(pen.getCommands()),
        "a": round(adv[ch], 3),                       # advance width
        "x": [round(b[0], 3), round(b[2], 3)],        # ink left/right, for exact boxing
    }

data = {
    "size": SIZE,
    "boxHeight": round(REF_INK[3], 2),   # comma descender — fixed so numbers never shift
    "instance": {"wght": WGHT, "wdth": WDTH},
    "glyphs": glyphs,
    "kern": KERN,
}

out = os.path.join(os.path.dirname(__file__), "..", "assets", "js", "mandatory-digits.js")
banner = ("/* Mandatory Variable, 'Black Condensed 29' (wght %d, wdth %d) at %gpx.\n"
          "   Outlines for 0-9, ',' and '%%' ONLY, brand shear baked in as Figma bakes it.\n"
          "   Generated from the licensed desktop font by tools/build-digits.py.\n"
          "   The font file itself is never shipped. Do not edit by hand. */\n"
          % (WGHT, WDTH, SIZE))
with open(out, "w") as f:
    f.write(banner + "window.MANDATORY_DIGITS = " +
            json.dumps(data, separators=(",", ":")) + ";\n")
print("\nkern pairs:", KERN)
print("wrote assets/js/mandatory-digits.js (%.1f KB)" % (os.path.getsize(out) / 1024))
