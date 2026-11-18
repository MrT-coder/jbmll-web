---
titulo: QR Style, QR codes that keep the logo's look
desc: Free service that turns a logo into a scannable QR code that still looks like the logo, and runs entirely in the browser.
estado: construyendo
contexto: personal
fecha: 2026-11
st:
  - TypeScript
  - zxing-wasm
  - Vitest
  - Python
  - Cloudflare
  - GitHub Actions
kw:
  - QR codes
  - image processing
  - privacy
  - Web Worker
demo: https://qrstyle.jbmllnube.com
destacado: false
borrador: false
---

I built a free service that turns a person's logo into a QR code that phones can scan and that still looks like the logo. The user picks one of three styles, and the image never leaves their device.

![QR Style interface in dark mode: logo upload, link field and the selector for the three QR styles](/media/qr-style-interfaz-en.png "The interface: logo, link and style in three steps.")

## Three QR styles

A generic QR looks like nothing. I implemented three ways of blending the logo in. "Woven" uses the whole logo as the background and modulates only the center of each module. "Classic" draws round dots in the logo's color, circular finder patterns and the logo on a center plate. "Inside the logo" draws a small QR in a clear area of the logo, with strokes that follow its ridges, and leaves the rest of the image untouched. Letting the user choose the style is a product decision: each logo looks better with a different one.

## Everything in the browser

I had planned an API with FastAPI and dropped it. A logo is brand material, and a free service with no server and no database has nothing to leak and nothing to maintain. The engine is written in TypeScript on typed arrays, runs in a Web Worker so the page does not freeze, and is published as a static site on Cloudflare Pages.

## Verifying before delivering

A beautiful QR that does not scan is useless. Every result is decoded in the browser itself with zxing-wasm, across several variants of the image, and the parameters are tuned per URL: the same settings that worked for one address failed for another. I pick a configuration that passes with margin, not the minimum one that passes. I also validate logo size and URL length so the tool asks for what scanning needs.

## Python prototype as a reference

I validated the algorithm in Python first and kept it in the repository as a reference for the TypeScript engine. The Vitest tests run every style against the sample logos and decode them with zxing.

## Printing and language helpers

I added a print size guide, custom colors for the classic style with contrast warnings, security headers, and a Spanish/English switcher with a parity test between dictionaries. The CSP is still report-only until I review the deployed site.

## Pending

An end-to-end test in a real browser is still missing, as is calibrating the size and density values with real phones.
