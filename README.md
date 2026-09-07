# הדמוקרטים — Landing Page

Static display landing page for Democratim (הדמוקרטים בראשות יאיר גולן),
built pixel-close to the Figma design
([node 97-855](https://www.figma.com/design/6lc8ziwtWv5fengLoaS2qW/HaDemocratim?node-id=97-855&m=dev)) —
the revision that shortened the midsection and turned the sign-up counter into
a progress bar. The artboard is 1440 × 2207.

Plain HTML/CSS/JS — no build step. Open `index.html` (it's already in the
XAMPP web root) or serve the folder with any static server.

## Layout model

* The design canvas is **1440 px**. On tablet/desktop all content lives in
  `.inner` wells that stay centred at 1440.
* **≥ 1440 px** — backgrounds and full-bleed visuals (hero photo, marquee,
  angled navy slab) expand to the viewport; the central content stays 1440.
* **900–1440 px** — the whole 1440 canvas scales down proportionally, centred
  (`#root` transform in `js/main.js` → `fit()`). At 900 it sits at ~0.62×.
* **< 900 px** — a dedicated **single-column mobile layout**, entirely in CSS
  (`@media (max-width: 899px)` at the bottom of `style.css`). `fit()` bows out
  here; it uses the *same* media query (`matchMedia`) so JS and CSS can't
  disagree about which mode is active.

### Mobile notes

Everything reflows into one centred column. Each stacked group (hero title/sub/
button, the "הידעת?" pair, the progress bar) is **sheared once on its wrapper**,
exactly as on desktop — sheared box-by-box the pieces stack dead in line;
sheared as a unit they stagger and read as one sheared block. The angle itself
is unchanged (the SVGs are baked to 9°); only the
marquee / navy-edge *rotations* are eased to ~1°. The marquee bar is the divider
between the navy hero and the light-blue section — no white gap above or below
it (the container carries a navy-over-blue split so the tilt's corner slivers
fill correctly); its two accent lines keep the desktop treatment (≈two-thirds
width, one straddling the top edge pushed right, one straddling the bottom edge
pushed left, each overhanging its horizontal end and poking a few px past the
bar onto the section above / below) rather than the plain full-width rules that
read as flat. That overhang only shows if `.marquee` stays **positioned** on
mobile — as `static` its `z-index` is inert and the neighbouring bands paint
over it, which looks exactly like the stripes being cropped; and once
positioned, the desktop `top:674px` comes back to life, so the mobile rule
resets `top:0`. The angled navy edge is a rotated `.band--navy::before` wedge instead of
the desktop `.navy` slab; the young-man image loses the booth and gets cropped
by that wedge, as on desktop. Form fields stack one per row. Parallax is
disabled.

The midsection keeps the fact box + button at full column width, with the
volunteer photo below them, offset right and **cropped by the navy** rather than
by CSS — he overflows the blue band's content box via a negative `margin-bottom`
and runs under the section edge, so the cut is hidden exactly the way the slab
crops his legs on desktop. A CSS crop (`object-fit:cover` on a short box) left a
hard horizontal edge sitting in the middle of the blue instead.

Visible height works out to `reserved height + padding-bottom − the wedge's 26px
reach`. He passes behind the "עד כה נרשמו" tag on the way down, which is the same
overlap the tag and progress box have with him on desktop. His width is
`clamp()`ed rather than a plain percentage: the tag that crosses him doesn't
shrink with the column, so at a straight 62% he lost ~50px of height on a 320px
screen and the tag swallowed the ballot.

**The margin-bottom is the one number to watch.** It sets both how much of him
shows and how much of the cut is tucked under the navy, and the two trade off
directly — at `-98px` the overlap is only 7–13px. Centring him horizontally is
what makes that survivable: the wedge is rotated 1.4°, so its edge is highest at
the ends of the band and flattest at the middle. Off to one side, the same
margin would leave less cover on the low side and vary with viewport width.

The progress block's navy "עד כה נרשמו" tag is pulled up out of the navy band
(`margin-top:-96px` on `.count`, with matching bottom padding on the blue band
to receive it) so it reads against the **light blue**, with the top of the white
box straddling the seam — the relationship it has on desktop. Sitting inside the
band it was navy-on-navy and only the white text showed. This needs
`position:relative; z-index` on `.count`, and that isn't cosmetic: the
`::before` wedge is absolutely positioned, so it paints above static content and
covers the tag as soon as the tag moves up into it. Clearance to the wedge is
tuned to a constant 20px — it was 2px at first, which the wedge's rotation
(which lifts more the wider the viewport) would have eaten.

The progress bar keeps the **desktop composition** on mobile — full-width
track with the percentage over it and the red label beneath, tag overlapping
above. Only the track height (88 → 52px) and the percentage's type size come
down; the fill is a percentage width, so it needs no per-breakpoint tuning.

#### One gutter, one margin

`--gut` is the page margin and **every block's visual edge lands on it**. The
catch is that a sheared group's bounding box is wider than its layout box by
about `0.078 × the group's height` on each side, so a block set to `width:100%`
pokes into the gutter by an amount that depends on how tall it is — which is
why the blocks looked unevenly inset before.

Each group is therefore inset with `calc(100% - Npx)`, where `N` is that
block's *measured* total overhang. Two consequences worth keeping:

* **px, not `%`.** The overhang is height-driven, and heights barely move with
  viewport width, so it's a near-constant number of pixels. A percentage inset
  would produce a different visual margin at every width.
* Because `N` equals the overhang, each bbox comes out exactly the content-box
  width, so the visual margin *is* `--gut` — change `--gut` and every block
  follows. (Verified: at 360/375 the gutter is 18 and every block measures
  18; at 390 it's 24 and every block measures 24.)

Where a group's widest members sit at different heights the lean is off-centre
— the fact box is mid-column while its button is at the very bottom, and the
progress bar's white box sits below its tag — so those two carry a small
`margin-right` to recentre the bbox.

## The "Mandatory" typeface

Democratim's display face **Mandatory** has no web licence, so **every piece of
copy set in it is shipped as an outlined SVG**, never live text:

`assets/svg/*.svg` — hero title/sub/button, marquee text, the fact block,
"בואו להשפיע", "עד כה נרשמו", "מהמתנדבות והמתנדבים הנדרשים",
"הצטרפו עכשיו:", "שליחה", the logo lockup, chevron + star icons.
(`democ.svg` and `hayadata.svg` are leftovers from the previous revision —
the counter's label and the "הידעת?" tag — and are no longer referenced.)

`assets/svg/_raw/` holds the untouched Figma exports (with their ancestor
decoration) in case a string needs to be re-generated — not referenced by the
page.

Only the form field labels and the consent line use a real web font
(**Heebo**, Google Fonts).

### The progress bar, and its live percentage

The volunteer counter was replaced by a **progress bar**: a grey track with a
red fill, the percentage over it, and "מהמתנדבות והמתנדבים הנדרשים" beneath.

**One number drives everything.** `data-pct` on `.count` sets an inline `--pct`
custom property; the fill is `width: calc(var(--pct) * 1%)` and the label is
composed from the same value. To change it, edit `data-pct` in `index.html`, or
call `window.setProgress(62)` at runtime (`setProgress(62, false)` snaps
without animating). The inline `--pct` also means the bar is already at the
right width **with JS off**.

The track fills from the **right** — it's an RTL page, so progress grows the
way the language reads. That needs `direction:ltr` on `.bar` alongside
`justify-content:flex-end`: under the page's `dir="rtl"`, `flex-end` resolves
to the *left* and puts the fill on the wrong side.

The percentage is **not** a flat image — it's composed at runtime from Mandatory
glyph outlines, so it can be any value and animate in the real face.
`tools/build-digits.py` reads the licensed desktop font
(`MandatoryVariable.ttf`) and emits `assets/js/mandatory-digits.js`: SVG
outlines for **twelve glyphs only** (`0-9`, `,` and `%`), their advance widths,
and the font's kerning pairs — with the brand shear baked in exactly as Figma
bakes it. **The font file itself is never shipped to the browser**, which keeps
the same licensing posture as the other SVGs.

Figma reports the style as *Black Condensed 29*; the matching variable-font
instance is `wght 900, wdth 76` (the `fvar` named instance says `wdth 58`, which
does not reproduce the design — 76 was fitted against the original export and
matches every glyph to within 0.12px). The generator verifies itself by
composing `17,185` and diffing against `assets/svg/number.svg` — the old
counter's Figma export, kept **only** as that reference. To regenerate:

```bash
python3 tools/build-digits.py
```

Figma's design puts a hard 4px red offset behind the white glyphs — that's what
carries them across the grey/red edge, since the label is centred in the *track*
rather than in the fill. `text-shadow` doesn't apply to SVG shapes, and the
project avoids `filter: drop-shadow` (it pins a low-res backing store), so the
renderer emits the glyph paths **twice**: a red group offset by 4px, then the
white face on top. The offset is expressed in the outlines' own units, so it
scales with the SVG instead of with the viewport.

#### The count-up

The bar fills and the number counts up when the block scrolls into view, after a
**380ms delay** so the animation isn't already over by the time you get there —
1.5s, `easeOutCubic`, one clock driving both so they stay in step. It's armed by
the same `IntersectionObserver` + rect-`sweep()` pair as the reveals. Note it is
deliberately **not** in the reveals' 2.6s safety net: that net exists because
*hidden* content is a hard failure, whereas a bar still at 0 off-screen is not —
firing it there would spend the animation before anyone saw it.

`setProgress()` bumps a generation counter that invalidates any run still in
flight, so calling it mid-animation doesn't leave two rAF loops fighting over
the value. Under `prefers-reduced-motion` the bar simply starts at its value.

### The shear, and keeping the SVGs crisp

Every one of those text SVGs is exported from Figma **with the brand shear
already baked into its glyph geometry**. Each sits inside a `.skew` wrapper that
also shears the coloured box behind it. Applying the CSS shear on top of an
already-sheared SVG would (a) skew the text twice and (b) force the browser to
rasterise the SVG and then sample that bitmap through the transform — which is
what makes SVG text look soft or jagged next to Figma.

So the `<img>` elements carry `--unskew` (the exact inverse of `--skew`): the
wrapper shear and the image un-shear cancel out on the raster (accumulated
transform ≈ identity → the SVG is drawn 1:1, crisp), while the coloured box is
still a parallelogram and the glyphs still carry Figma's exact slant. The hard
offset drop-shadows are plain `box-shadow`, not `filter: drop-shadow`, for the
same reason (a filter layer would pin a low-res backing store).

**Size sheared boxes explicitly, don't build them from padding.** An `<img>`'s
layout box is the *sheared* ink bbox, which is wider than what `--unskew`
actually paints — so `padding × 2 + image` always overshoots. Every sheared box
(hero title/sub/button, the "הידעת?" pair, the progress bar) is given the explicit
un-sheared width/height from Figma, with the SVG at its natural size centred
inside it. That reproduces Figma's padding exactly and to within a couple of px.

**The three red CTAs share one style.** `להרשמה`, `בואו להשפיע` and `שליחה` all
use `.btn.btn--red`: red fill, `4px 4px 0 white` hard shadow, `14px 22px`
padding, `«` chevron, and a label SVG at a fixed 39px cap height. Only width
varies with the label length. The Figma source has them slightly inconsistent
(the submit button has a hidden chevron, no shadow, and bigger text) — this
deliberately overrides that. Each still inherits the brand shear from its
sheared wrapper, and each label carries `--unskew` while the chevron leans.

On `:hover` the button turns a brighter red (`#ff3b30`) and presses 2px into its
shadow; `:active` presses the full 4px. The press uses the `translate` property,
not `transform`, so it composes with the shear — which also means **the CTA
buttons must not carry `.reveal`**: that class animates via `translate` too and
its `.in` state (higher specificity) would cancel the hover. `.duknow__cta` had
it and moved differently from the other two until it was removed.

**Every exported asset needs checking for whether the shear is baked in.** Text
exports carry it (verified: the glyph slant measures 0.158 against Figma's
0.161), so they need `--unskew`. But the marquee's stars are drawn *upright* in
the design and export upright, so they need `--unskew` too — otherwise the
wrapper shears them and they lean when they shouldn't. Anything that should end
up leaning must be baked-and-cancelled, never sheared live.

## Stacking order

The blue → navy transition is a set of overlapping full-bleed layers, so
z-index matters:

| z | layer |
|---|---|
| 0 | `.blue-bg` — the light-blue field, extended past the navy slab's lowest top edge so no white seam can show |
| 1 | `.band--blue` art — the volunteer, the booth, the "הידעת?" block |
| 2 | `.navy` — the rotated navy slab; it crops the volunteer's legs, as in Figma. Its two white accent stripes are anchored to the centre of the content well (`left:50%` + a margin), not to the viewport edge, so their gap to the central text is identical at every width |
| 3 | `.band--navy` — progress bar, form, footer logo, `.social` icons, `.footnote` (copyright + credit line) |
| 4 | `.band--hero` |
| 6 | `.marquee` |

The marquee is a full-bleed red bar rotated **+1.5°** (dropping toward the
right). Its two white accent lines are **not** full-bleed: each is a fixed
1033px, one running along the bar's bottom edge on the left, the other along
its top edge on the right, each overhanging the bar slightly. Because they hang
outside the bar, the scrolling track is clipped by an inner `.marquee__clip`
rather than by the bar itself. Like the navy stripes, they're anchored to the
centre of the content well so the composition holds at any width.

## Motion

* Marquee strip scrolls infinitely (`@keyframes marquee`).
* Light parallax on the young-man / booth / fact block in the blue section.
* Subtle reveal-on-scroll for the fact block and the form.

All motion is disabled under `prefers-reduced-motion`, and every scroll-triggered
reveal has a rect-based fallback + hard safety timeout so content can never get
stuck hidden if `IntersectionObserver` misbehaves.

## The footer's social icons

Facebook / Instagram / X / TikTok, linking to the profiles taken from the footer
of [democrats.org.il](https://democrats.org.il/). The share and tracking query
strings those links carry there (`mibextid`, `igsh`, `s`, `_t`/`_r`) are
stripped — they're artefacts of however the links were first pasted, not part of
the address.

They're **inline SVG**, not `<img>` like the other icons, so the glyphs can take
`fill: currentColor` and shift to the brand blue on hover. The hit area comes
from `padding` on the `<a>` with `gap` reduced to match, so the target is 38px
on desktop and **44px on mobile** while the glyph stays 26/24px — tapping a bare
24px icon on a phone is too small.

This block isn't in the Figma artboard, so both `.band--navy` **and** the `.navy`
slab had to grow to make room. Miss the slab and it ends above the new footer,
leaving a white strip under the navy.

## The form

Display-only. On submit it shows a thank-you line and makes no network request —
wire a real endpoint into the `submit` handler in `js/main.js` when ready.
The privacy link points to `https://democrats.org.il/privacy-policy/`.

## Files

```
index.html
css/style.css
js/main.js
assets/js/mandatory-digits.js   generated glyph outlines for the live percentage
assets/img/*.webp               hero background + Golan cut-out + halftone photos
assets/svg/*.svg                all Mandatory-font copy, icons, logo
assets/svg/_raw/                original Figma exports (unused by the page)
tools/build-digits.py           regenerates assets/js/mandatory-digits.js
```
