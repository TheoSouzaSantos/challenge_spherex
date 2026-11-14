# Design: CosmoSight

Adapted from the SpaceX design analysis in VoltAgent/awesome-design-md (`spacex/DESIGN.md`, MIT): pure black canvas, white ink, 1 px hairlines, uppercase micro-labels, ghost buttons, no gradients, no decoration. We keep that austerity and add the two things a working instrument needs: one accent color and a monospace face for numbers.

## Idea

An observatory at night. Astronomers work under dim red and amber lamps so their eyes stay adapted to the dark. CosmoSight borrows that: a black room, white labels on the instruments, and a single warm amber lamp marking whatever you can act on right now. The sky images are the only color on screen.

## Colors

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#000000` | page canvas, image wells |
| `--surface` | `#0b0b0d` | panels (navbar, sidebar, drawer) |
| `--surface-2` | `#141417` | inputs, hover, nested blocks |
| `--line` | `#26262c` | section dividers |
| `--line-strong` | `#3a3a3f` | button and input borders (SpaceX hairline) |
| `--ink` | `#f0f0f5` | primary text (19:1 on black) |
| `--ink-2` | `#a3a3ae` | secondary text (8.4:1) |
| `--ink-3` | `#7b7b86` | captions, axis labels (4.9:1) |
| `--lamp` | `#f2a541` | the one accent: primary action, active tool, focus ring (9.6:1) |
| `--lamp-ink` | `#170f03` | text on the accent |
| `--alarm` | `#ff6b5e` | errors only |

Data colors are separate from UI colors and never used for chrome: detector bands D1-D6 (violet → red, ordered by wavelength), difference images (blue = fainter now, orange = brighter now), crosshair cyan `#00e5ff`, tracked path magenta `#ff4fd8`.

## Typography

D-DIN is proprietary, so we use its closest open relative.

- **Barlow** (Google Fonts, OFL) for everything in the UI: 400 body, 500 labels, 600 headings.
- **Barlow Semi Condensed** 600, uppercase, +0.14em tracking: brand wordmark and micro-labels (the SpaceX "eyebrow").
- **IBM Plex Mono** 400/500 for coordinates, dates and measurements, so digits line up.

Scale (px): 11 micro-caps · 13 caption · 14 body · 16 emphasis · 20 region title · 26 dialog title. Line height 1.45 for body.

## Shape and space

- Radius 4 px on buttons and inputs, 2 px on chips, 0 on panels. No pill buttons except the search bar.
- Borders 1 px. No shadows, except the drawer and the dialog that float over the sky (one soft shadow).
- Spacing on a 4 px grid: 4, 8, 12, 16, 24, 32.
- Every clickable thing is at least 40 px tall (44 px for the play button and toolbar).

## Components

1. **Panel section**: hairline top border + an 11 px uppercase micro-label, then content. Every block in the sidebar and drawer is one of these.
2. **Button**: ghost (transparent, `--line-strong` border, `--ink` text, 13 px). Primary = filled `--lamp`. Active toggle = `--lamp` border and text. Icon buttons are square, 40 px.
3. **Field**: `--surface-2` background, `--line-strong` border, `--lamp` focus ring.

Everything else (segmented control, chips, sliders) is a variation of these three.

## UX rules we follow (and where)

- **Hick's law, fewer choices at once.** The toolbar shows five tools. Speed, period and blink pair live behind *More controls* (progressive disclosure), and the layers panel opens only on demand.
- **Fitts's law.** Play/pause is the biggest control and sits right under the image. Prev/next are next to it. Hit areas are 40 px or more.
- **Gestalt proximity and common region.** Controls that act together sit in the same labelled section (Tools / Region / Time / Measure). Unrelated controls never share a row.
- **Visual hierarchy, one accent.** Only the thing you can do next is amber. Everything else is white or grey.
- **Recognition over recall.** Every icon has a text label. Shortcuts are shown in tooltips and in the help dialog, never required.
- **Visibility of system status.** Loading states say what is happening and roughly how long ("Reading 102 bands from AWS…"). Data provenance is visible (real vs simulated, live vs prebaked).
- **Error prevention and recovery.** Bad coordinates get an example of the right format. Long loads can be cancelled. Esc always closes things.
- **Consistency.** One button style, one field style, one label style, the same icon for the same action everywhere.
- **Plain language.** Labels say what things do ("Compare two dates"), not what they are called internally ("Blink mode").

## Writing voice

Short sentences, second person, no hype, no exclamation marks, no emoji. Say what the person sees and what to do next. Example: "Press play. If a dot moves while the stars around it stay put, it is close to us."
