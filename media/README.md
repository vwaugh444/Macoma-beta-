# Macoma films

Three short commercial-style films, one per use case, written as HTML and rendered frame by frame:

| Film | File | Story |
|---|---|---|
| Home & life | `films/home.html` | A parent's day: morning brief, a plan that moves, a reminder on repeat |
| The trades | `films/trade.html` | A plumber in the truck: running late, invoice from the driveway, paid with Apple Pay |
| Your business | `films/business.html` | A salon owner: the brief, getting paid, a lead that books, the day on record |

Open a film in a browser to preview it (it loops). To render:

```bash
node media/render.mjs home          # → media/out/home.mp4, 1920×1080, 30 fps, with UI sounds
node media/render.mjs home --stills 5,12,30   # check single frames
```

It needs Playwright with Chromium (`PLAYWRIGHT_MODULE` can point at an install) and ffmpeg. The soundtrack is a quiet synthesized pad plus message sounds. For social posts, add licensed music in the app you post from.

Everything on screen is defined in `films/film.js` (phone, Messages thread, notifications, connections hub, end card) and `films/film.css` (the liquid-glass look). Edit a film's script to change its words or timing.

The website uses 720p copies in `public/media/` (`home.mp4`, `trade.mp4`, `business.mp4`) with poster images.
