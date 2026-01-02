# Eyedid/SeeSo Web (GitHub Pages) – Minimal Gaze Demo

## What this repo does
- Uses your **existing** `seeso.js` and `easy-seeso.js` (the webpack-module style files)
- Loads them in the browser without bundlers (via `js/webpack-loader.js`)
- Runs gaze tracking on GitHub Pages (HTTPS)
- Registers a COI service worker to enable SharedArrayBuffer when needed

## Deploy on GitHub Pages
1. Create a GitHub repo and upload all files in this folder.
2. GitHub → Settings → Pages → Build and deployment:
   - Source: `Deploy from a branch`
   - Branch: `main` / `/ (root)`
3. Open the published URL.

## Calibration
Calibration starts automatically when the page loads (no button click). It will redirect to the calibration service and return with:
`?calibrationData=...`

After calibration returns with `?calibrationData=...`, the demo applies it automatically and caches it in `localStorage`.

## License key
`index.html` defaults to:
`dev_1ntzip9admm6g0upynw3gooycnecx0vl93hz8nox`

Override by URL:
`?licenseKey=YOUR_KEY`
