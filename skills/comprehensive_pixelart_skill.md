---
name: pixel-art-guide
description: >-
  Comprehensive beginner-to-advanced pixel art workflow, critique checklist, and
  style guide tailored to this webapp's Pixel Editor. Use when creating,
  advising on, reviewing, critiquing, planning, or animating pixel art assets,
  palettes, linework, shading, outlines, or exports inside this app.
---

# Pixel Art Guide (Using This Webapp)

Actionable workflow, webapp tool reference, and critique checklist

## Quick Workflow Overview

Follow this four-stage order for every sprite or tile in the editor:

1. **Canvas & Palette Setup** — Set a sprite-appropriate canvas size (`New / resize canvas`), keep the grid (`#`) visible, and lock in a tight, high-contrast palette (`>= 3` shades per color) in the **Color / Palette** panel.
2. **Outline / Silhouette** — Block proportions using **Rectangle (`U`)**, **Ellipse (`O`)**, **Contour (`D`)**, or **Pencil (`B`)** with **Pixel perfect** enabled, then clean doubles and jaggies.
3. **Flat Base Colors** — Fill enclosed areas with **Fill bucket (`G`)** (`<= 3` colors per material), ideally on a separate layer (`Shift+N`) beneath or above your linework.
4. **Shade, Highlight, Outline & Polish** — Apply shadows and highlights from a fixed light source; refine outlines manually or with **Auto outline (`Shift+O`)**; verify readability in the **1× Preview** panel and export crisp PNG/GIF (`Ctrl+E`).

---

## 1. Webapp Workspace & Setup

Everything needed for drawing, layering, animating, and exporting is built directly into this webapp (autosaved locally and works offline):

| Area | What It Does | Key Controls / Shortcuts |
| :--- | :--- | :--- |
| **TopBar** | Project name, canvas size/resize, open/save/export, undo/redo, flip H/V, auto outline, grid, zoom, help | `Ctrl+S` (save `.pixel.json`), `Ctrl+O` (open `.pixel.json` or PNG/GIF/BMP/WEBP up to `512×512`), `Ctrl+E` (export), `Shift+O` (Auto outline), `#` (grid), `?` (shortcuts) |
| **ToolOptions Bar** | Context-sensitive settings for the active tool (brush size/shape, Pixel perfect, Mirror symmetry, Filled, Contiguous, Blur, Text) | `[` / `]` (brush size `1–16px`), `X` (swap Left/Right colors) |
| **Left Toolbar** | Drawing, shape, fill, selection, text, blur, move, and pan tools | Single-key tool shortcuts (`B`, `E`, `G`, `I`, `L`, `U`, `O`, `M`, `Q`, `W`, `D`, `R`, `T`, `V`, `H`) |
| **Canvas** | Integer-zoomed pixel viewport (`0.5×`–`96×`) with optional pixel grid and `8px` major grid lines | Wheel or `+`/`-` (zoom), `0` (fit to screen), `Space + drag` or middle-drag (pan), Right-click (paint with secondary color), `Alt + click` (pick color) |
| **Right Sidebar** | **Color & Palette**, **Layers** (up to 32), and live **Preview** (`N×` and actual `1×` size) | `Shift+N` (new layer), `↑`/`↓` (switch layer when no selection), `Alt+click` eye icon (solo layer) |
| **Bottom Timeline** | Frame-by-frame animation (up to 256 frames), cel matrix, tags/loops, duration, and onion skin | `Alt+N` (duplicate frame), `Alt+Shift+N` (new empty frame), `Enter` (play/pause), `,`/`.` or `←`/`→` (prev/next frame), `K` (onion skin) |
| **StatusBar** | Live cursor `(x, y)` coordinates, canvas dimensions, zoom level, and selection size | Useful for coordinate-accurate alignment and edge checks |

### Canvas Sizing & Resizing
* Click **New / resize canvas** in the TopBar to pick presets (`8×8`, `16×16`, `24×24`, `32×32`, `48×48`, `64×64`, `128×128`, `256×256`, `512×512`) or any custom size up to `512×512` (default `32×32`).
* Need breathing room after starting? Use **Resize current** with `center` or `top-left` anchor instead of **Create new** so you don't lose existing pixels.

---

## 2. Color & Palettes (Color Panel)

* **Start from the built-in palette or a curated ramp**: The editor starts with the **PICO-8** 16-color palette, which is already high-contrast and well-balanced for small sprites.
* **Left (Primary) vs. Right (Secondary) color slots**:
  * Left-click a palette swatch to set **Left (primary)**; right-click a swatch to set **Right (secondary)**.
  * Press `X` (or click `⇄`) to swap them quickly—great for alternating between a base color and shadow/highlight, or painting with Left-click and erasing/shading with Right-click.
  * While using **Pencil (`B`)** or **Eraser (`E`)**, hold `Alt + click` to sample a color directly from the canvas without switching tools, or press `I` (**Eyedropper**, left-click = primary, right-click = secondary).
* **Building custom hue-shifted ramps in the editor**:
  * Use the hex color picker or type a hex code in the `#` input, then click **+ Add** to append the swatch to your **Palette**.
  * Aim for **at least 3 shades per material** (base, shadow, highlight) and keep total colors tight (`8–16` for small sprites). Too many intermediate shades create visual noise and muddiness.
  * Hover over any swatch and click `×` to remove stray or unused colors.
* **Auditing & locking colors with "From canvas"**:
  * Click **From canvas** in the Palette header to replace the palette with the exact opaque colors currently on the flattened canvas (up to 256). Use this to spot accidental near-duplicate colors or lock in an imported PNG's palette.
  * Click **Reset** at any time to restore the default PICO-8 palette.

---

## 3. Linework, Silhouettes & Shape Tools

### Starting an Outline or Silhouette
Choose either approach using the webapp's tools:
* **Construction lines**: Sketch rough proportions with **Pencil (`B`)** at `1px` or **Line (`L`)** (hold `Shift` to snap angles), then refine into clean edges.
* **Shape blocking**: Block solid forms first with **Rectangle (`U`)** or **Ellipse (`O`)** with **Filled** toggled on in ToolOptions (hold `Shift` for perfect squares/circles), or draw an organic filled shape in one stroke with **Contour (`D`)**—then sculpt the silhouette with **Pencil (`B`)** and **Eraser (`E`)**.
* **Symmetrical assets**: Toggle **Mirror → Horizontal** (and/or **Vertical**) in ToolOptions for Pencil, Eraser, Line, Rectangle, Ellipse, or Contour when blocking front-facing characters, icons, or props.
* **Quick mirroring & nudging**: Use **Flip horizontal / vertical** in the TopBar (flips the active selection, or the whole layer if nothing is selected), or select with **Rectangle select (`M`)**, **Lasso (`Q`)**, or **Magic wand (`W`)**, then **Move (`V`)** or nudge with Arrow keys (`1px`, or `Shift + Arrow` for `8px`).

### Eliminating "Doubles"
* **What doubles are**: Extra corner pixels where two straight 1px segments meet at a right angle (`L`-corners), making lines look thick, chunky, and stair-stepped.
* **Use Pixel Perfect mode**: Select **Pencil (`B`)** or **Eraser (`E`)** at `1px` size and enable **Pixel perfect** in the ToolOptions bar—the editor will automatically strip accidental L-shaped doubles from freehand strokes.
* **Intentional exception**: Turn **Pixel perfect** off only when you deliberately want a heavy, chunky retro outline, and keep those corners consistent across the entire piece.

### Fixing "Jaggies" (Jagged Curves & Diagonals)
* Even without doubles, abrupt jumps in segment length (e.g., `1 → 4 → 1 → 3`) make curves look jagged when zoomed out.
* **Smooth segment progression**: Step segment lengths gradually (e.g., `1 → 2 → 3 → 2 → 1`), keeping lengths symmetrical on either side of a curve.
* **Endpoint-first technique**: Place the **two opposite endpoints** first (or draft with **Line (`L`)** / **Ellipse (`O`)**), then clean the pixels between them at `1px` while watching the **Preview** panel at `1×`.

---

## 4. Shading, Hue Shifting & Perspective

### Layer-Friendly Shading Order
Use the **Layers** panel (`Shift+N` to add a layer, `Alt+click` the eye icon to solo a layer) so edits stay non-destructive:
1. **Base flats**: Fill enclosed regions using **Fill bucket (`G`)** with **Contiguous** enabled. Turn **Contiguous** off if you want to globally swap every pixel of a color on the active layer in one click.
2. **Shadows**: Paint shadow areas on the same layer or a dedicated shading layer above it.
3. **Highlights**: Place highlights on the lit side.
4. **Merge when ready**: Use **Merge down** or **Flatten all layers** once the material reads cleanly.

### Hue Shifting (Analogous Colors)
* Instead of shading purely by lowering lightness (muddy black/white mixes), shift toward **analogous hues** when adding swatches to your Palette:
  * **Orange base** → **Yellow** highlight, **Purple** shadow.
  * **Red base** → **Orange** highlight, **Purple** shadow.
  * **Green base** → **Yellow** highlight, **Blue** shadow.
* Ensure neighboring materials differ in **value (lightness)** as well as hue so shapes don't blur together.

### Light Source & Avoiding Pillow Shading
* **Never pillow shade**: Wrapping shadows uniformly inside the entire outline without a directional light source makes forms look flat and puffy.
* **Lock a global light source**: Choose one angle (commonly top-left or top-center) and keep it consistent across every frame and asset.
* **Top-down / 3/4 / Oblique views**: Keep the top plane brightest and shade the front plane and under-overhangs (chin, arms, rims) consistently across all scene objects.

### Perspective Consistency
* Match the amount of visible top surface across objects in the same scene (use the `8px` major grid lines with `#` and cursor `(x, y)` coordinates in the StatusBar to align proportions and ground lines).

---

## 5. Stylistic Techniques, Text & Outlines

### Dithering & Anti-Aliasing
* **Avoid dithering and anti-aliasing on tiny sprites (`< 32px`)** where every pixel carries structural weight.
* On larger sprites (`32px–512px`), place checkerboard dithering manually with `1px` **Pencil (`B`)** (`Left`/`Right` colors) for texture, or place intermediate-value pixels strictly in high-contrast corners for manual anti-aliasing.
* **Blur brush (`R`)**: Use sparingly on larger sprites or soft backgrounds; enable **Snap to palette** and **Keep transparency** in ToolOptions so softened pixels never introduce off-palette color bloat.

### Pixel Text (`T`)
* Use **Text (`T`)** with the built-in **`pixel-3x5`** or **`pixel-5x7`** bitmap fonts (and integer `Scale`) rather than anti-aliased system fonts so UI labels, signs, and icons stay razor-sharp. Drag the text box on the canvas and press `Enter` to commit (`Esc` to cancel).

### Outline Design & Using Auto Outline (`Shift+O`)
You can draft outlines manually or generate and customize them with **Auto outline (`Shift+O` / Sparkles icon in TopBar)**:

| Technique | How to Do It in This Webapp | Reference Effect |
| :--- | :--- | :--- |
| **Classic 1px Black/Dark Outline** | Open **Auto outline (`Shift+O`)** → `Thickness: 1px`, `Corners: Clean` (cuts diagonal corner pixels), `Placement: Outside`, `Color: Solid` (darkest palette shade). | Clean, readable sprite separation |
| **Colored / Selective Outlines** | In **Auto outline**, choose `Color: Auto shade` (`Darkness` `10–90%`) to automatically darken neighboring fill colors—or use `Placement: Inside` to recolor edge pixels without growing the sprite. | Softer integration (*Stardew Valley*-style) |
| **Non-Destructive Outlines** | Keep **Put the outline on its own layer** checked in Auto outline so you can erase inner edges, tint lit-side outline pixels lighter, or toggle visibility. | Easy directional polish & cleanup |
| **Thick Retro Outlines** | Set `Thickness: 2–4px` with `Corners: Square` or `Round` in Auto outline. | Bold, chunky aesthetic (*Tinkerlands*-style) |
| **Selective / Two-Tier Hierarchy** | Outline players/interactables (or use `Solid` black), and skip outlines or use `Auto shade` on background tiles. | Clear gameplay foreground/background separation (*Celeste*, *AK-xolotl*) |

* **Tip**: Use Auto outline's **Ignore specks up to** slider if stray 1px floating dots shouldn't get outlined, and **Outline holes inside the shape** when interior cutouts need borders.

---

## 6. Animation Workflow (Timeline)

1. **Block key poses first (pose-to-pose)**:
   * Press `Alt+N` (**Duplicate frame**) to copy the previous pose, erase/select (`M`/`Q`) and redraw only the moving part, or press `Alt+Shift+N` for a **New empty frame**.
   * Use the **Timeline cel grid** to edit specific layers per frame—shared background/static layers don't have to be redrawn from scratch.
2. **Use Onion Skin (`K`)**:
   * Toggle **Onion skin (`K`)** to see previous frames tinted red and upcoming frames tinted blue (`0–5` frames before/after) so arcs, ground lines, and squash-and-stretch stay consistent.
3. **Control timing & named loops**:
   * Set per-frame **Duration (`ms`)** directly in the Timeline (or Shift+click a range of frames to batch-set duration, or click **All** to apply evenly).
   * Shift+click a range of frames and click the **Tag** icon to label loops (e.g., `idle`, `walk`, `attack`) with `Forward →`, `Reverse ←`, or `Ping-pong ↔` playback direction.
4. **Live preview while editing**:
   * Enable **Animate** in the right-sidebar **Preview** panel to watch your loop at `1×` and `N×` scale while continuing to paint on the canvas, or press `Enter` to play/pause directly on the main canvas (`,` / `.` to step frame by frame).

---

## 7. Exporting & Programmatic Access

### Crisp Exports (`Ctrl+E`)
* **PNG image**: Exports the current frame's flattened visible layers using **nearest-neighbor** scaling (`1×`, `2×`, `4×`, `8×`, `16×`, `32×`) so edges stay pixel-sharp.
* **Animated GIF**: Exports either all frames or a specific **Tag** loop (`Forward`, `Reverse`, or `Ping-pong`) at nearest-neighbor scale (up to `2048px` max side).
  * *GIF note*: GIF supports up to `256` colors and binary transparency only—pixels under `50%` opacity become transparent, and the rest become solid.
* **Save project (`Ctrl+S`)**: Downloads a `.pixel.json` file preserving all layers, frames, durations, tags, and palette.

### Built-in Browser API (`window.pixelEditor`)
When automating edits, linting pixels, or inspecting coordinates in the browser console/agent context, this webapp exposes `window.pixelEditor` (from `usePixelEditorApi`) with helpers including:
* **Inspect**: `getDimensions()`, `getPixel(x, y)`, `getGrid()`, `getAsciiArt()`, `toDataURL({ scale, composite })`
* **Draw**: `setPixel(x, y, color)`, `setPixels([...])`, `drawLine(...)`, `drawRect(...)`, `drawCircle(...)`, `floodFill(...)`, `loadGrid(...)`, `loadAsciiArt(...)`, `mutatePixels(...)`
* **Layers, Frames & Tags**: `getLayers()`, `addLayer()`, `setActiveLayer(i)`, `getFrames()`, `addFrame()`, `duplicateFrame()`, `setFrameDuration(i, ms)`, `addTag(from, to, opts)`, `exportGif(...)`
* **Colors**: `getColors()`, `setPrimaryColor(c)`, `setSecondaryColor(c)`, `setPalette(hexArray)`

---

## 8. Critique & Troubleshooting Checklist

When reviewing or diagnosing pixel art in this webapp, check items in this order:

1. **1× Preview readability check**: Look at the actual-size **`1×` box in the Preview panel** (not just zoomed in on the canvas). Does the silhouette read clearly at `1×`?
2. **Color bloat check**: Click **From canvas** in the Palette panel (or check `Palette (N)` count) to verify no stray or near-duplicate shades slipped in. Aim for `<= 3` shades per material unless stylistically justified.
3. **Linework check**: Zoom in with the grid (`#`) enabled—check for accidental **doubles** (fix with **Pixel perfect** on `1px` Pencil) or uneven **jaggies** breaking curves and diagonals.
4. **Lighting & pillow-shading check**: Confirm a single directional light angle across the sprite and check that shadows aren't uniformly hugging the outline.
5. **Hue shift check**: Verify shadows and highlights shift toward analogous hues rather than flat black/white mixes.
6. **Clean edges & strays check**: Scan against the checkerboard in the **Preview** panel for detached 1px stray pixels or misaligned ground lines (use StatusBar `x, y` coordinates to verify).
7. **Animation check** *(if animated)*: Toggle **Animate** in the Preview panel and step frames with `,` / `.`—check that feet stay grounded, colors remain consistent across frames, and timing (`ms`) emphasizes anticipation and impact.
