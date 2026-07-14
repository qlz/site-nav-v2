# site-nav-v2

Basic GitHub Pages portfolio navigator.

## Local

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Shareable entry URLs

Every uploaded HTML page and saved link has a unique hash URL that works on GitHub Pages:

```text
https://<user>.github.io/<repo>/#/item/<entry-id>
```

Open an entry, then use **Copy link** in the viewer top bar.

## Viewer chrome

While previewing, click the ✕ icon to hide the top bar for a full-bleed view. Opening another entry brings the bar back.

## Files

- `index.html` — page markup
- `styles.css` — styles
- `app.js` — app logic
- `config.js` — Supabase public config
