---
name: Journal
description: Handwritten pages, folded into insight.
colors:
  indigo-900: "#16232c"
  indigo-700: "#223648"
  indigo-600: "#2c4658"
  indigo-500: "#3f5f74"
  indigo-400: "#8fb0bf"
  paper-100: "#faf4e8"
  paper-200: "#f2e8d5"
  paper-300: "#e4d5b8"
  ink-900: "#241a13"
  ink-600: "#5a4a3c"
  gold-500: "#c99a3c"
typography:
  display:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    letterSpacing: "0.15em"
rounded:
  sm: "2px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-600}"
    textColor: "{colors.paper-100}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-500}"
  button-locked:
    backgroundColor: "{colors.gold-500}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-locked-hover:
    backgroundColor: "{colors.gold-500}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-600}"
    rounded: "{rounded.sm}"
---

# Design System: Journal

## Overview

**Creative North Star: "Orizuru Fold Sequence"**

A handwritten page becomes a saved set of insights the way one uncut sheet of paper becomes a standing crane: through a small number of deliberate, numbered, reversible folds, not a form to fill in. The system was chosen through Impeccable's direction roll for the capture flow (`/capture`) — the assigned world was a wet-darkroom proofing metaphor; this challenger, drawn from paper-folding instruction sheets, won on fit for a handwritten-journal audience and was picked over the assignment. It is deliberately not the document-scanner default (camera-corner viewfinder, flat text box, Confirm button) and not the diary-app default (pastel lined paper, cursive script face).

Two materials carry the whole system: a calm indigo "aizome" (indigo-dyed washi) ground with a numbered margin column for chrome, wayfinding, and identity; and a cream paper working surface, in plain sumi ink, for anything the user actually has to read or edit. The indigo field is where the app speaks; the paper card is where the user works — legibility of real content, especially OCR text the user must correct, always wins there. Gold marks the locked/saved step and nothing else, so it stays legible as a state signal rather than becoming a second accent color. The palette started as a saturated vermilion and was recolored to this calmer indigo on direct user feedback; the fold-sequence structure and paper/ink material logic carried over unchanged.

**Key Characteristics:**
- Calm, muted-slate Committed color strategy (indigo carries the page) — recolored from an earlier saturated vermilion for a calmer feel; never a neutral SaaS gray shell either
- A numbered fold-sequence margin rail is the system's one wayfinding device — it replaces tabs, breadcrumbs, and step-wizard chrome everywhere this world is used
- Paper vs. ground is the legibility contract: content and correction always happen on the cream paper surface, never directly on indigo
- Gold is reserved exclusively for the locked/saved state — never used decoratively
- Editing is direct: the OCR-correction stage is a real editable text field, not a confirm-only interaction — the user can freely rewrite, not just approve flagged words
- Insight review is view-and-decide, not verify-and-approve: each insight can be kept or discarded, and saving never requires confirming every item is "correct"
- IBM Plex Sans for voice, IBM Plex Mono (tabular, tracked) for step numbers, confidence counts, and any diagram-adjacent labels
- No cards-of-icons grids, no kicker/eyebrow labels, no modal steppers — the continuous panel + margin rail replaces the wizard-modal default

## Colors

Two grounds, not a gray scale: a dark, muted indigo for the app's own chrome, and a warm off-white paper for working content. Gold is a single reserved state color, not a palette member to reach for elsewhere.

- `indigo-900` `#16232c` — deepest shadow/rule value on the indigo field
- `indigo-700` `#223648` — primary chrome ground (page background)
- `indigo-600` `#2c4658` — primary action fill on the indigo field
- `indigo-500` `#3f5f74` — borders, rules, hover fill, the crease-line texture
- `indigo-400` `#8fb0bf` — secondary text/labels on the indigo ground (never gray-on-color)
- `paper-100` `#faf4e8` — working surface, the panel the user reads and edits on
- `paper-200` `#f2e8d5` — recessed content within the paper surface (text blocks, dropzones)
- `paper-300` `#e4d5b8` — tags/chips on paper (e.g. "Example OCR output")
- `ink-900` `#241a13` — primary text on paper
- `ink-600` `#5a4a3c` — secondary text on paper
- `gold-500` `#c99a3c` — locked/saved state only, on both grounds

## Typography

IBM Plex Sans (voice) paired with IBM Plex Mono (data/step figures) — a drafting-manual, instruction-sheet pairing that matches the numbered-fold-diagram identity; deliberately not a display serif or a handwriting-style face, which would read as diary-app costume rather than the chosen world.

- Display/heading: IBM Plex Sans, 600, tight line-height, sits directly under the mono stage label — no kicker/eyebrow above it
- Body: IBM Plex Sans, 400, ~15px, 1.6 line-height, for anything the user reads or edits at length (OCR text, insight copy)
- Mono/label: IBM Plex Mono, tracked (+0.15em), uppercase, small — reserved for stage numbers ("01", "02"), confidence counts, and section tags like "EXAMPLE OCR OUTPUT"

## Layout

The margin rail + continuous panel is the one layout device: a numbered stage list runs down a fixed-width left column from `sm` upward (compact horizontal dot-and-line strip below `sm`), beside a single paper panel that swaps content per stage rather than routing to separate pages or opening a modal. Container max-width `5xl`, generous outer padding (`px-6 py-12`, scaling to `px-10 py-16`), content measure kept comfortable for reading OCR text (not full-bleed).

## Elevation & Depth

Flat indigo field; paper sheets are the only elevated surfaces, each lifted with one soft offset shadow (`0 14px–18px … rgba(0,0,0,0.5–0.6)`, tuned to the sheet's size) suggesting paper resting on the field rather than cards floating in a UI. Pills and other content living inside a sheet stay flat — no nested shadows, no glass/blur, no shadow-on-shadow.

## Shapes

Two-tier radius rule: surfaces stay sharp, actions and tags go soft. Paper panels/cards/sheets keep the `2px` paper-like radius (`rounded-sm`) — they're material, not chrome. Anything interactive or tag-like — buttons, links styled as buttons, chat inputs, insight pills — uses full round (`rounded-full`, the `rounded.full` token) instead; this is what keeps the system from reading as a rigid dashboard-card grid. Borders are hairline (`1px`, often at reduced opacity over indigo) where they appear at all — the crease-line motif, not decorative dividers — but pills and buttons generally skip borders entirely and rely on fill + shadow/elevation for shape.

## Components

- **Stage rail item**: a small line-drawn fold glyph (outline square = pending, open diamond = active, filled gold diamond = locked) connected by a hairline "crease" rule; label only from `sm` upward.
- **Primary action** (`button-primary`): indigo-600 fill, paper-100 text, 2px radius; hover to indigo-500; disabled drops to 40% opacity rather than changing hue.
- **Locked/save action** (`button-locked`): gold-500 fill, ink-900 text — the one place gold is a fill rather than an accent, reserved for the final "Save entry" action.
- **Ghost/back action**: text-only, ink-600, underline on the paper surface; no border, no background.
- **Entry text field**: a real `<textarea>` on the paper-200 surface, ink-900 text, indigo-500 focus border — the user can rewrite anything directly, not just approve individual flagged words. A quiet caption below names which words had low OCR confidence, informational only, never gating.
- **Insight row**: paper-200 card with label/value text and a single trash-glyph icon button (`DiscardIcon`) — no per-item "correct/incorrect" state. Removing a row is the only per-item action; "Save entry" is otherwise always available. The trash icon arms an inline confirm (the row's content swaps for "Remove '{label}'?" plus Keep/Remove) rather than deleting immediately — a destructive one-click action always gets this two-step confirm in this system, never a browser-native `confirm()` dialog.
- **Exit/back link**: a small underlined text link with a left-chevron glyph (`BackIcon`), top of any page that isn't the home surface itself (`/capture`, `/chat`) — every non-home page gets one. Prevents dead-end/no-escape flows; not needed on home since it has nowhere "back" to go.
- **Example-content tag**: paper-300 chip, mono, uppercase, small — used any time on-screen content is illustrative/synthetic rather than real extracted data, per PRODUCT.md's rule that demonstration data must be labeled.
- **Insight flow** (read-only, home surface): one paper-100 sheet, not a grid of separate cards. The most prominent insight renders as a large lead statement (`text-2xl`/`3xl`, its label as an indigo-600 inline lead-in, not a separate heading); the rest flow below as `rounded-full` paper-200 pills in a `flex-wrap` row, sized to their own content — a bento/dashboard grid of same-size boxes was tried and explicitly rejected as too rigid. Pills carry no border; a soft fold-in stagger animation is the only motion.
- **Primary CTA link/button**: the largest button-primary variant, `rounded-full`, `text-lg`, generous `px-7 py-4` padding, a small line-drawn icon on its left, a soft shadow with a hover lift (`-translate-y-0.5`) — reserved for the one unmissable action per page (e.g. "Add today's page" on home). Don't use this scale for secondary actions.
- **Contextual chat/ask card**: paper-100 sheet with a speech-glyph + label header, one sentence of framing copy, and a real `rounded-full` text input + `rounded-full` submit button — never a floating action button or modal. Placed directly adjacent to the content it's "about" (e.g. right after insights), not in a persistent nav/header slot. An unwired backend still gets a real, honest inline response ("X isn't connected yet") rather than a disabled control or a faked answer.
- **Chat answer rendering**: assistant answers are real markdown (`react-markdown`) inside the paper-200 answer block, not plain text — the model is prompted to structure multi-item answers as lists with **bold** short labels, and the renderer actually turns that into spaced paragraphs/lists/bold rather than a wall of raw text. Every top-level block gets consistent spacing via one `[&>*+*]:mt-3` rule on the container rather than per-tag margins.
- **Hero fold motif**: a large (~340px) decorative background graphic built from the same diamond fold-glyph as the stage rail, nested at three scales, low-opacity indigo strokes with the innermost diamond filled gold — the system's identity mark brought to full, confident scale on hero/landing-style moments. Decorative only (`aria-hidden`), never obscures foreground text or controls.

## Do's and Don'ts

- Do keep all real content (OCR text, insight copy, anything editable) on the paper surface in ink-900/ink-600 — never render body copy directly on indigo.
- Do reserve gold-500 for the locked/saved state, plus the single innermost diamond of the hero fold motif (the system's identity mark, not a UI state). Don't use it as a general accent or highlight color anywhere else.
- Do vary insight sizing (lead statement vs. flowing pills) for hierarchy. Don't lay insights out as a uniform grid of same-size boxes — that reads as a generic dashboard, not this world.
- Do use `rounded-full` for buttons, inputs, and pills. Don't mix radius scales within the same control type.
- Do use the numbered margin rail as the only step/wayfinding device in this world. Don't add a progress bar, breadcrumb, or modal stepper alongside it.
- Do label synthetic/example content explicitly (paper-300 mono chip). Don't let mock OCR text or mock insights read as real extracted data.
- Do let the user freely edit entry text in a real field. Don't reduce correction to a confirm-only per-word interaction.
- Do let insight review be keep-or-discard only. Don't ask the user to mark each insight correct/incorrect before they can save.
- Do cap "latest insights" views to a small, non-scrolling set. Don't build an infinite/paginated insight history feed without a specific reason to.
- Do give an unwired feature (like chat) a real, honest inline response. Don't fake a working feature or silently disable its controls.
- Do give every non-home page a visible way back (the exit link). Don't ship a multi-step flow with no escape route besides the browser back button.
- Do confirm destructive one-click actions inline before they happen. Don't delete on a single click, and don't reach for a browser-native `confirm()`.
- Don't reach for a card-grid-of-icons layout, a kicker/eyebrow label, or gradient text — these are the system's refused defaults.
- Don't introduce a second display face or a handwriting/script face; IBM Plex Sans + IBM Plex Mono is the whole type system for this world.
