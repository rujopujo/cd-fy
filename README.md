# cd-fy

A [Spicetify](https://spicetify.app) extension that turns the cover of the playlist you're playing into a spinning CD.

*cd* like a disc, *fy* like Spotify.

---

## Contents

- [What it does](#what-it-does)
- [Making a cover that looks right as a CD](#making-a-cover-that-looks-right-as-a-cd)
- [Installation](#installation)
- [The cd-fy menu, item by item](#the-cd-fy-menu-item-by-item)
- [Mouse and keyboard controls](#mouse-and-keyboard-controls)
- [Good to know](#good-to-know)
- [Troubleshooting](#troubleshooting)
- [Uninstalling](#uninstalling)
- [Privacy](#privacy)
- [Licence](#licence)

---

## What it does

- **Spins the CD.** While a playlist plays, its cover spins like a disc in the playlist header, in the sidebar, and on the home and search shelves. When you pause, it glides back to where it started.
- **Glass CD case.** On the playlist page the CD sits in a clear glass jewel case with a black spine on the right. The spine has three working buttons: **next** (top), **play/pause** (middle) and **previous** (bottom). To open the case, push the lid up from the groove on its left edge, or just click the groove. The lid swings a full 180° to the right and the playlist details slide over to make room. Click the lid again to shut it.
- **Inspect Case.** A glass button above your username, tinted with the playlist's colour. Press it and the shut case is lifted toward you and turned over in the light, showing its edges, groove and spine, then set back down. If the case is open, it shuts first.
- **Scratch.** Click and drag the spinning CD to scratch it. **This moves the song's playback position**, like scratching a real record.
- **Hover tilt.** With the case open and the music paused, the CD leans toward your cursor.
- **Click ripple.** With the case open and the music paused, clicking the CD sends a slow ripple out from that spot, like a drop landing in water.
- **Platform.** With the case turned off, the CD sits on a black deck platform with brass edges instead.

While the case is shut, only the spin runs; nothing else moves the CD. While it's open and music is playing, you can scratch, but tilt and ripple wait until you pause.

---

## Making a cover that looks right as a CD

cd-fy shows the **middle 83.3%** of your playlist picture as the CD. That's a fixed 120% zoom, the same for every playlist. The rest is cropped away, and the CD is then trimmed to a circle.

So for the disc to fill the CD exactly, with no border showing around it, draw your disc like this:

| Measurement | Rule | Example on a 1000 × 1000 picture |
|---|---|---|
| Picture shape | Square | 1000 × 1000 px |
| Disc diameter | 83.33% of the picture's width (width ÷ 1.2) | 833 px |
| Disc position | Centred, horizontally and vertically | centre at (500, 500) |
| Margin round the disc | 8.33% of the width on each side (width ÷ 12) | 83.5 px |
| What goes in the margin | Anything: it's never shown | — |
| Corners outside the disc | Anything: they're trimmed off | — |

```
 ┌───────────────────────────────┐  ← your picture: W × W
 │ ░░░░░░░ margin W/12 ░░░░░░░░░ │
 │ ░░░░  ╭───────────────╮  ░░░░ │
 │ ░░░ ╱                   ╲ ░░░ │
 │ ░░ │   disc: W ÷ 1.2 wide  │ ░░│
 │ ░░ │    centred            │ ░░│
 │ ░░░ ╲                   ╱ ░░░ │
 │ ░░░░  ╰───────────────╯  ░░░░ │
 │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
 └───────────────────────────────┘
   ░ = cropped away, never shown
```

### Ready-made sizes

| Picture | Disc diameter | Margin on each side |
|---|---|---|
| 640 × 640 | 533 px | 53.5 px |
| 1000 × 1000 | 833 px | 83.5 px |
| 1200 × 1200 | 1000 px | 100 px |
| 1500 × 1500 | 1250 px | 125 px |
| 2400 × 2400 | 2000 px | 200 px |
| 3000 × 3000 | 2500 px | 250 px |

**1200 × 1200 with a 1000 px disc** gives the roundest numbers. Spotify shows covers at up to 640 px, so 640 × 640 or larger is plenty.

### Tips

- **Already have square art you want to use as is?** Every part outside the middle 83.3% gets cropped. Either keep important things (faces, text) inside that middle circle, or shrink the art to 83.3% and centre it on a larger square canvas.
- **The centre hole isn't added for you.** If you want a spindle hole or a silver hub, draw it into your picture at the centre.
- **Upload the picture as usual:** on the playlist page, open **…** → **Edit details**, then pick the image.
- **A disc that's a bit off?** Hold **Ctrl** and scroll over the CD to fine-tune that playlist's zoom (see [Mouse and keyboard controls](#mouse-and-keyboard-controls)). cd-fy remembers it for that playlist only.

---

## Installation

### 1. Install Spicetify

Skip this if you already have it. Close Spotify first, then follow the steps for your system.

**Windows** (PowerShell, *not* as administrator):

```powershell
iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh
```

When the installer asks whether to install the Marketplace, say **yes**. Full details are in the [Spicetify docs](https://spicetify.app/docs/getting-started).

### 2a. Install cd-fy from the Marketplace (recommended)

1. Open Spotify. A **Marketplace** item appears in the top bar or sidebar.
2. Open the **Extensions** tab and search for **cd-fy**.
3. Click **Install**. Spotify reloads, and you're done.

Installing this way means you get updates automatically.

### 2b. Install cd-fy by hand

1. Download [`cd-fy.js`](cd-fy.js) from this repository.
2. Find your Spicetify `Extensions` folder:

   ```bash
   spicetify path userdata
   ```

   Open the folder it prints, then the `Extensions` folder inside it. The usual places are:

   - **Windows:** `%APPDATA%\spicetify\Extensions`
   - **macOS / Linux:** `~/.config/spicetify/Extensions`

3. Copy `cd-fy.js` into that folder.
4. Turn it on and apply:

   ```bash
   spicetify config extensions cd-fy.js
   spicetify apply
   ```

5. Spotify restarts with cd-fy running. A hand install doesn't update itself: to update it, copy in the new `cd-fy.js` and run `spicetify apply` again.

> Install it **one way only**. If both the Marketplace copy and a hand-installed copy are present, only the first one to load runs.

### After a Spotify update

Spotify updates can remove Spicetify. If cd-fy disappears, run:

```bash
spicetify backup apply
```

---

## The cd-fy menu, item by item

Open the profile menu (your avatar, top right) and hover over **cd-fy**.

How to read the menu:

- **Headings** are white and bold. You can't click them.
- **On/off items** are **green** when on and **grey** when off. Click one to flip it.
- **Actions** (the two resets) are plain white.

Every change saves straight away and shows a small status pill in the bottom-right corner.

### At the top

| Item | What it does | Default |
|---|---|---|
| **disable cd-fy.** / **enable cd-fy.** | Turns the whole extension off or on. Off means covers look exactly as Spotify draws them. | on |

### speed.

Pick one. The current speed is shown in green.

| Item | What it does | Default |
|---|---|---|
| **slow : ten rpm** | 10 turns a minute | |
| **medium : thirty rpm** | 30 turns a minute | ✔ |
| **fast : fifty rpm** | 50 turns a minute | |

### behaviour.

| Item | What it does | Default |
|---|---|---|
| **direction : clockwise / counter-clockwise** | Which way the CD turns. Click to switch. | clockwise |
| **smooth ramp** | The CD speeds up gently when music starts and slows down gently when it stops, instead of starting and stopping at once. | on |
| **return to start on pause** | On pause, the CD glides back to its upright starting position. Off: it stops wherever it is. | on |
| **needle wobble** | A slight, uneven wobble while the CD spins, like a real disc on a turntable. | on |
| **scratch press-down** | While you hold the CD to scratch, it sinks in a little and springs back when you let go. | on |
| **hover tilt (playlist page)** | The CD leans toward your cursor (case open, music paused). | on |
| **click wave (playlist page)** | Clicking the CD sends a ripple out from that spot (case open, music paused). | on |
| **platform (playlist page)** | The black deck with brass edges under the CD. Only shows while **cd case** is off. | on |
| **cd case (playlist page)** | The glass jewel case with the black spine and its next / play-pause / previous buttons. | on |

### where to spin.

| Item | What it does | Default |
|---|---|---|
| **playlist header** | Spin the big cover at the top of the playlist page. | on |
| **sidebar** | Spin the playlist's small cover in Your Library. | on |
| **home, search & shelves** | Spin the playlist's cover wherever it shows up on home, search and other shelves. | on |

### At the bottom

| Item | What it does |
|---|---|
| **reset CD fit (this playlist)** | Forgets the Ctrl + scroll zoom you set for the playlist you're on, and goes back to the standard 120%. |
| **reset to defaults.** | Puts every setting back the way it was when installed, including any zoom you fine-tuned for individual playlists. |

---

## Mouse and keyboard controls

| Action | Where | What happens |
|---|---|---|
| Push up from the groove, or click it | Left edge of the shut case | The case unlatches and the lid opens 180° |
| Click the lid | Open case | The case shuts with a click |
| Click the shut lid anywhere else | Shut case | The lid rattles and the groove flashes, to show where to open it |
| Click **Inspect Case** | Above your username | The case is picked up and looked over (it shuts first if open) |
| **▲** / **▶❚❚** / **▼** | Black spine | Next song / play or pause / previous song |
| Click and drag | The spinning CD | Scratch: moves the song's playback position |
| Move the mouse over | The CD (case open, paused) | Hover tilt |
| Click | The CD (case open, paused) | Click ripple |
| **Ctrl** + scroll | The CD on a playlist page (case open, or case turned off) | Fine-tunes that playlist's zoom, from 100% to 200%. Scroll up to zoom in. |
| **Ctrl + Alt + ↑** | Anywhere | Next faster speed |
| **Ctrl + Alt + ↓** | Anywhere | Next slower speed |

---

## Good to know

- Only playlists spin. Album, artist and podcast pages are left as Spotify draws them.
- Only the playlist that's **playing** spins. Other playlists' covers stay still.
- While cd-fy is using the header cover, Spotify's "Choose photo" overlay is hidden so it doesn't cover the CD. You can still change the picture from the playlist's **…** menu → **Edit details**.

---

## Troubleshooting

**Nothing spins.** Check that:

- cd-fy is enabled in the menu;
- a **playlist** (not an album) is playing;
- the place you're looking at is switched on under **where to spin.**

**A border or ring shows round the CD.** Your disc is smaller than 83.3% of the picture. Hold **Ctrl** and scroll up over the CD until the ring is gone, or redraw the cover using the [sizes above](#ready-made-sizes).

**The menu or the extension is missing after a Spotify update.** Run `spicetify backup apply`.

**Still stuck?** Turn on developer tools:

```bash
spicetify enable-devtools
```

Then, in Spotify, press **Ctrl + Shift + I** (**Cmd + Option + I** on macOS), open the **Console** and run:

```js
cdfyDebug()
```

It prints what cd-fy sees. Messages from the extension start with `[cd-fy]`.

---

## Uninstalling

**Marketplace:** go to Marketplace → Extensions → cd-fy → **Remove**.

**Hand install:**

```bash
spicetify config extensions cd-fy.js-
spicetify apply
```

Then delete `cd-fy.js` from your `Extensions` folder.

---

## Privacy

Everything runs locally in your Spotify app. Settings are saved in Spotify's local storage on your computer. The extension sends nothing anywhere. The only thing it loads is the playlist's own cover image, from Spotify.

---

## Licence

MIT. See [LICENSE](LICENSE).
