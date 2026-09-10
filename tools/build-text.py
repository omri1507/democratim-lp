#!/usr/bin/env python3
"""
Render a line of Mandatory-set Hebrew to an outlined SVG.

Democratim's display face has no web licence, so copy set in it ships as
outlined SVG. Those were originally exported by hand from Figma; this does the
same job from the licensed desktop font, so a wording change doesn't need a
round-trip through the design file. The font is never shipped — only outlines.

It self-checks: `--verify` re-renders a string whose Figma export is already in
the repo and compares the ink box, so you know the pipeline still matches
Figma's before trusting it on new copy.

Usage:
  python3 tools/build-text.py --verify
  python3 tools/build-text.py --text "..." --out assets/svg/foo.svg --fill '#EF1A22'
"""
import argparse, os, re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

SRC = os.path.expanduser("~/Library/Fonts/MandatoryVariable.ttf")
C, D = 0.156434, 0.987688       # the brand shear, exactly as Figma bakes it
# Two instances are in use in this design, both fitted against real Figma
# exports rather than taken from the fvar named instances:
#   wdth 76 — the counter/body copy ("Black Condensed 29")
#   wdth 90 — the red buttons' labels  (fitted so "להרשמה" == 188x39)
WGHT, WDTH = 900, 76

# a string already exported from Figma, used to prove the pipeline still matches
REF_TEXT = "מכוח ההתנדבות הנדרש"   # must match whatever REF_SVG currently holds
REF_SVG  = "assets/svg/nidrashim.svg"


def load():
    inst = instantiateVariableFont(TTFont(SRC), {"wght": WGHT, "wdth": WDTH},
                                   inplace=False)
    return inst, inst.getGlyphSet(), inst.getBestCmap(), inst["hmtx"]


def kern_pairs(inst, names):
    """PairPos values from the 'kern' feature, for the glyphs we actually use."""
    out = {}
    if "GPOS" not in inst:
        return out
    table = inst["GPOS"].table
    want = set(names)
    idxs = set()
    for fr in table.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern":
            idxs.update(fr.Feature.LookupListIndex)
    for i in idxs:
        for sub in table.LookupList.Lookup[i].SubTable:
            if getattr(sub, "Format", None) == 1:
                for first, ps in zip(sub.Coverage.glyphs, sub.PairSet):
                    if first not in want:
                        continue
                    for r in ps.PairValueRecord:
                        if r.SecondGlyph in want and r.Value1 and r.Value1.XAdvance:
                            out[(first, r.SecondGlyph)] = r.Value1.XAdvance
            elif getattr(sub, "Format", None) == 2:
                c1, c2 = sub.ClassDef1.classDefs, sub.ClassDef2.classDefs
                for first in sub.Coverage.glyphs:
                    if first not in want:
                        continue
                    for second in want:
                        v = sub.Class1Record[c1.get(first, 0)] \
                               .Class2Record[c2.get(second, 0)].Value1
                        if v and v.XAdvance:
                            out[(first, second)] = v.XAdvance
    return out


def layout(text, size):
    """Glyph pen positions for an RTL line, in font units scaled to `size`.

    Laid out in LOGICAL order advancing leftwards, which is what keeps the GPOS
    pair lookups (defined on logical adjacency) lining up with the right pairs.
    """
    inst, gs, cmap, hmtx = load()
    upem = inst["head"].unitsPerEm
    scale = size / upem
    names = [cmap[ord(c)] for c in text]
    kern = kern_pairs(inst, set(names))

    pen, placed = 0.0, []
    for i, gname in enumerate(names):
        adv = hmtx[gname][0]
        if i + 1 < len(names):
            adv += kern.get((gname, names[i + 1]), 0)
        pen -= adv
        placed.append((gname, pen))
    return inst, gs, scale, placed


def ink(gs, scale, placed):
    mnx = mny = 1e9
    mxx = mxy = -1e9
    for gname, x in placed:
        bp = BoundsPen(gs)
        t = Transform(scale, 0, -C * scale, -D * scale, x * scale, 0)
        gs[gname].draw(TransformPen(bp, t))
        if bp.bounds:
            a, b, c_, d_ = bp.bounds
            mnx, mny = min(mnx, a), min(mny, b)
            mxx, mxy = max(mxx, c_), max(mxy, d_)
    return mnx, mny, mxx, mxy


def render(text, size, fill):
    inst, gs, scale, placed = layout(text, size)
    x0, y0, x1, y1 = ink(gs, scale, placed)
    w, h = x1 - x0, y1 - y0
    num = re.compile(r"-?\d+\.\d+")
    tidy = lambda d: num.sub(lambda m: ("%.2f" % float(m.group())).rstrip("0").rstrip("."), d)

    parts = []
    for gname, x in placed:
        pen = SVGPathPen(gs)
        # shift so the ink box starts at 0,0
        t = Transform(scale, 0, -C * scale, -D * scale, x * scale - x0, -y0)
        gs[gname].draw(TransformPen(pen, t))
        d = pen.getCommands()
        if d:
            parts.append(tidy(d))
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" '
           'viewBox="0 0 %s %s" fill="none">\n<path d="%s" fill="%s"/>\n</svg>\n'
           % (round(w, 2), round(h, 2), round(w, 2), round(h, 2),
              " ".join(parts), fill))
    return svg, w, h


def fit_size(text, target_w):
    """Solve the font size that puts the ink box at `target_w` wide."""
    lo, hi = 10.0, 400.0
    for _ in range(60):
        mid = (lo + hi) / 2
        inst, gs, scale, placed = layout(text, mid)
        x0, _, x1, _ = ink(gs, scale, placed)
        if x1 - x0 < target_w:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--text")
    ap.add_argument("--out")
    ap.add_argument("--fill", default="#EF1A22")
    ap.add_argument("--size", type=float)
    ap.add_argument("--wdth", type=float, help="width axis; 76 body, 90 button labels")
    ap.add_argument("--wght", type=float)
    a = ap.parse_args()

    if a.wdth: WDTH = a.wdth
    if a.wght: WGHT = a.wght

    here = os.path.join(os.path.dirname(__file__), "..")

    # The self-check only means anything on the instance the reference was
    # exported at (wdth 76). Asking for another width axis skips it.
    if a.wdth and a.wdth != 76:
        if not (a.text and a.out and a.size):
            sys.exit("--wdth needs --text, --out and an explicit --size "
                     "(the built-in reference is wdth 76 only)")
        svg, w, h = render(a.text, a.size, a.fill)
        open(os.path.join(here, a.out), "w", encoding="utf-8").write(svg)
        print("wrote %s  (%.2f x %.2f at %.3fpx, wght %g / wdth %g)"
              % (a.out, w, h, a.size, WGHT, WDTH))
        sys.exit(0)

    ref = open(os.path.join(here, REF_SVG), encoding="utf-8").read()
    rw, rh = (float(v) for v in re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', ref).groups())

    size = a.size or fit_size(REF_TEXT, rw)
    _, w, h = render(REF_TEXT, size, a.fill)
    print("verify against %s" % REF_SVG)
    print("  fitted size   %.3f px" % size)
    print("  ink  %.2f x %.2f" % (w, h))
    print("  figma %.2f x %.2f" % (rw, rh))
    print("  error  w %+.2f   h %+.2f" % (w - rw, h - rh))
    if abs(h - rh) > 1.0:
        sys.exit("ERROR: height is off by more than 1px — layout does not match Figma")

    if a.verify or not a.text:
        sys.exit(0)

    svg, w, h = render(a.text, size, a.fill)
    dest = os.path.join(here, a.out)
    open(dest, "w", encoding="utf-8").write(svg)
    print("\nwrote %s  (%.2f x %.2f at %.3fpx)" % (a.out, w, h, size))
