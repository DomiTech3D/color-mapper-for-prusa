# Releasing (maintainer notes)

**English**

1. Upload the changed files to `main`. The *Checks* workflow tests and builds everything; the *Web version* workflow updates GitHub Pages.
2. Releases → **Draft a new release** → new tag, e.g. `v1.2.2` → title → **Publish release**.
3. The *Release* workflow builds `ColorMapperForPrusa.exe` and `color-mapper.html` from the tagged source, records the build provenance and attaches both files plus `SHA256SUMS.txt` to the release (2–3 minutes).

One-time setup: Settings → Pages → Source: **GitHub Actions**. To redeploy the web version by hand, use Actions → Web version → **Run workflow**.

**Deutsch**

1. Geänderte Dateien auf `main` hochladen. Der Workflow *Checks* testet und baut alles, *Web version* aktualisiert GitHub Pages.
2. Releases → **Draft a new release** → neues Tag, z. B. `v1.2.2` → Titel → **Publish release**.
3. Der Workflow *Release* baut `ColorMapperForPrusa.exe` und `color-mapper.html` aus dem Quellcode dieses Tags, hält die Herkunft fest und hängt beide Dateien samt `SHA256SUMS.txt` ans Release (2–3 Minuten).

Einmalig: Settings → Pages → Source: **GitHub Actions**. Die Web-Version von Hand neu veröffentlichen: Actions → Web version → **Run workflow**.
