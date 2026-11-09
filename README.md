# Color Mapper for Prusa

**English** · [Deutsch](README.de.md)

> **Independent project.** Color Mapper for Prusa is a free community tool by [DomiTech3D](https://github.com/DomiTech3D).
> It is **not affiliated with, endorsed by or supported by Prusa Research** (or Bambu Lab or Spooly).

Put every color of a multi-color 3MF on the right tool of your Prusa printer – in the browser, without repainting anything.

You found a painted model for Bambu Studio, OrcaSlicer or PrusaSlicer, but its colors sit on different extruders than the filaments loaded in your printer. Color Mapper for Prusa shows the model in 3D, lets you assign each file color to one of your tools or MMU slots, and saves a 3MF for PrusaSlicer with the painting moved accordingly.

![Color Mapper for Prusa with the 8-color 3DBenchy sample](docs/screenshot.png)

## Features

**Everywhere (web version and Windows program)**

- Opens 3MF projects from **Bambu Studio, OrcaSlicer and PrusaSlicer** (painted models and per-object colors)
- 3D preview with the file colors or with your loaded filaments; hover a color or a tool to see exactly which areas it prints
- **Automatic mapping by color similarity and color family** – a brown goes to your brown filament, not to the red one – adjustable with one click per color
- Your tool colors are remembered per printer in your browser
- English and German, switchable at the top right
- Everything runs locally: your 3MF files are never uploaded anywhere

**Windows program (optional)**

- **Live tool colors from Prusa Connect** (unofficial) – the filament loaded in each tool or MMU slot, updated every 30 seconds
- **Or live from [Spooly](https://spooly.eu)** (official API), with even more:
  - remaining weight per tool and a warning when a spool is running low
  - for every color of your file, **the best matching spool from your whole stock** – loaded or not – planned onto a tool
  - choose a spool for any tool yourself from your stock, with storage location
  - optional: enter the planned spools in Spooly with one click
- Empty tools are shown as empty and are not used for automatic mapping
- Under **Mapping**, every file color shows what exactly is loaded (or planned) in the chosen tool
- **Details** lists printer, update time and every tool with spool, material, remaining weight and storage location
- A note when a print would mix materials (for example PLA and ASA)

## Supported printers

| Printer | Tools |
|---|---|
| CORE One INDX, CORE One L INDX | 4 or 8 tools |
| CORE One, CORE One L, MK4S, MK3.9S, MK3.5S with MMU3 | 5 slots |
| Prusa XL, XL+ | 5 or 2 tools |

Tested on a real CORE One INDX. The other printers use the same file format and the same data from Prusa Connect and Spooly, but haven't been tried on real hardware yet – feedback is welcome.

## Web version or Windows program?

Both are the same Color Mapper. The Windows program adds the live tool colors from Prusa Connect or Spooly.

| | Web version | Windows program |
|---|---|---|
| Installation | none | download `ColorMapperForPrusa.exe` and start it |
| Works on | any computer or tablet with a current browser (Windows, macOS, Linux) | Windows |
| Open, map and save 3MF | yes | yes |
| Tool colors | set by hand once per printer, remembered by your browser | automatically from Prusa Connect or Spooly |
| Spools from your Spooly stock | – | yes |

## Web version

- **Online:** [domitech3d.github.io/color-mapper-for-prusa](https://domitech3d.github.io/color-mapper-for-prusa/)
- **Offline:** download `color-mapper.html` from the [latest release](../../releases/latest) and open it in Chrome, Edge, Firefox or Safari.

1. Choose your printer under **Printer**.
2. Set the color of each tool or slot: tap it and pick the color of the filament that is loaded. You do this once; the browser remembers it.
3. Drag your 3MF file onto the page.
4. Check the mapping – every file color gets a tool. **Map automatically by color** does it for you; hover a row to see where the color is used.
5. Click **Save for PrusaSlicer**.

### Opening the result in PrusaSlicer

1. Select your printer in PrusaSlicer (for example the CORE One INDX).
2. Drag the file into the window or use **File → Import → Import STL/3MF/STEP/OBJ/AMF** (Ctrl+I).
3. If PrusaSlicer asks whether to open the file as a project or import the geometry only, choose **Import geometry only** so your printer profile stays.
4. Check the painting with the **Multimaterial painting** tool (key N) before printing.

## Windows program

1. Download `ColorMapperForPrusa.exe` from the [latest release](../../releases/latest) and start it. A black window opens and the Color Mapper opens in your browser.
2. Choose the source of the tool colors at the top of the live box: **Prusa Connect** or **Spooly** (see below).
3. Keep the black window open while you use the Color Mapper. Closing it stops the program.

**“Windows protected your PC”:** the program is not code-signed, so Windows SmartScreen warns about it on first start. Click **More info → Run anyway**. If your browser or company blocks downloading `.exe` files, you can't use the Windows program on that computer – the web version works without it.

*Optional – check the download:* the files in the releases are built by GitHub directly from this source code. Compare the SHA-256 (`Get-FileHash ColorMapperForPrusa.exe` in PowerShell) with `SHA256SUMS.txt` from the release, or, with the [GitHub CLI](https://cli.github.com/), run `gh attestation verify ColorMapperForPrusa.exe --repo DomiTech3D/color-mapper-for-prusa`.

### Live colors from Prusa Connect

1. In the live box, choose **Prusa Connect** and click **Connect to Prusa Connect**.
2. Sign in on the Prusa page that opens. The program never sees your password.
3. If you have several printers, choose yours under **Printer**. The matching printer profile is chosen automatically.

The colors update every 30 seconds. When you load a new spool, the color changes by itself. A tool without filament in Prusa Connect is shown as empty. You can still give a tool your own color by tapping it; **↺ Connect** takes the color from Prusa Connect again.

### Live colors and stock from Spooly

[Spooly](https://spooly.eu) is a filament manager. Through its official API the Color Mapper reads which spool is in which slot and what you have in stock.

![The Windows program with Spooly: live tool colors, a spool from stock planned for T2, and the Details panel](docs/screenshot-spooly.png)

**You need**

- a Spooly account with **Pro** (or the trial) and **API access** (the API is currently a beta – request access from Spooly)
- your printer set up in Spooly with its slots (for an INDX: slots 1-1 to 1-8)
- the Windows program – Spooly does not allow access from web pages, so this does not work in the web version

**Set up**

1. In Spooly, create a **personal API key** (it starts with `spk_`). For live colors, reading is enough. Only the optional *entering of spools in Spooly* (see below) needs a key that may write.
2. Start `ColorMapperForPrusa.exe` and switch the live box from **Prusa Connect** to **Spooly**.
3. Paste the key and click **Connect to Spooly**. The key is checked right away.
4. Check under **Details** that every tool shows the right spool.

**How it works**

- **Tool colors:** come from the spools in your Spooly slots, updated about every minute. The printer profile is chosen from the printer model (for example `COREONE_INDX8T`). Under each tool you see material and remaining weight; spools that are running low are marked.
- **Best spool for your file:** when you open a file, every file color gets the spool from Spooly that matches it best – loaded or in stock:
  - A loaded spool wins if it matches practically as well, so you don't swap spools for nothing.
  - Only spools of the file's material are used (PLA for PLA), unless none of them fits.
  - Spools from your stock go first into a tool that has practically the same color (for example black PLA into the tool with black ASA), then into empty slots, then into a tool the print doesn't need whose current color is most similar – no black into a tool that printed white. Tools the print needs are never replaced.
  - Spools that are almost empty come last.
  - A message says what was planned and which spool it would replace. **Discard** undoes a plan, **Map automatically by color** plans again. Nothing happens for the sample model shown at start.
- **Choose a spool yourself:** the spool button (◎) under each tool opens your stock – searchable, with remaining weight, storage location and where a spool is loaded right now. Spools that match your file are on top.
- **Plans are only plans:** Spooly is not changed. Planned spools are listed below the tools with their storage location, so you know what to load where. As soon as Spooly reports the planned spool in that slot, the plan is done.

**Optional: enter spools in Spooly**

Tick **Allow entering spools in Spooly** (off by default). Then each planned spool gets an **Enter in Spooly** button, and the spool window can empty a slot in Spooly. Nothing is changed in Spooly without one of these clicks.

- This needs the **slot autopilot** in Spooly and a key that may write.
- If the printer reports a different color for the slot, the Color Mapper asks first (**Assign anyway**).

**Good to know**

- **Assign every slot once in Spooly.** Spooly only offers a slot to the API after a spool was assigned to it once in Spooly. A slot that was never used is missing – it can't be entered from the Color Mapper, and the program log shows *“not listed in GET /slots”*. Fix: assign any spool to that slot once in Spooly (you can empty it again afterwards).
- The key is stored encrypted (Windows DPAPI) in `%APPDATA%\ColorMapperForPrusa`, is never shown again and never written to the log. **Disconnect** deletes it.
- The program only calls Spooly while the Color Mapper is open: about two calls a minute, the stock every five minutes. Spooly's daily limit (10,000 calls) is far away.
- The Color Mapper can't tell whether a spool has *enough* filament for the print: a 3MF file contains no filament usage – that is calculated by the slicer.
- Spooly is an independent product; this project is not affiliated with it.

**If something doesn't work**

| Message | What to do |
|---|---|
| Spooly does not accept this key | Copy the key again completely (starts with `spk_`); create a new one in Spooly if needed. |
| Spooly refused access | Your Spooly account needs Pro (or the trial) and API access. |
| Spooly does not list T2 in its slot list | Assign a spool to that slot once in Spooly (see *Good to know*). |
| Spooly's daily limit is used up | Colors update again the next day. |
| Spooly lists T2 but without a slot ID | Turn on the slot autopilot for this printer in Spooly. |
| Spooly does not allow this key to change slots | Create a key with write access, or leave entering off. |

The **Program log** at the bottom of the live box shows which slots Spooly offers for each printer.

### What the Windows program does and stores

- It listens only on `127.0.0.1:8765` (your own computer) and refuses requests from other sites.
- Prusa Connect: you sign in on Prusa's own page; the sign-in is stored encrypted (Windows DPAPI) in `%APPDATA%\ColorMapperForPrusa`. It only reads your printers and the filament in each tool.
- Spooly: the API key is stored the same way. The program reads printers, slots and spools; it only writes to Spooly when you click **Enter in Spooly** or empty a slot.
- **Disconnect** deletes the stored sign-in or key. Tokens and keys are never written to the log.

## About the Prusa Connect connection (unofficial)

- Prusa does not offer a public interface for third-party tools. The Windows program uses the same, **undocumented** interface that the Prusa Connect website itself uses.
- Prusa can change that interface at any time. **The live colors from Prusa Connect may therefore stop working in the future**, without notice. They are provided as is.
- **The web version does not depend on Prusa Connect and will continue to be supported** – without automatic filament sync: you set the tool colors by hand (once per printer, the browser remembers them).
- The Spooly connection uses Spooly's official API and is not affected by this.

## FAQ

**Does it work for Bambu Lab printers?**
Bambu Studio and OrcaSlicer files can be *opened*, but the result is always a PrusaSlicer project for a Prusa printer.

**Does it work on a Mac?**
Yes, the web version works in Safari, Chrome and Firefox. The Windows program with live colors is only available for Windows.

**Does it change my original file?**
No. It always saves a new file (`…_INDX.3mf`, `…_MMU3.3mf`, `…_XL.3mf` or `…_remapped.3mf`).

**Does it check whether a spool has enough filament?**
No. A 3MF file contains no filament usage; only the slicer calculates it (it depends on infill, walls, supports and the wipe tower). The Color Mapper shows the remaining weight from Spooly so you can judge it yourself.

**Why do some areas turn grey while hovering?**
On purpose: only the areas printed by the color or tool under the mouse pointer stay in color.

## Feedback

This is a hobby project and my first one on GitHub – feedback is very welcome. Found a bug, a 3MF that doesn't work, or have an idea? Please [open an issue](../../issues). For problems with a specific file, a short description of the printer, the slicer it came from and what went wrong helps a lot.

## Build from source

Requirements: Python 3, Go 1.22 or newer, Node.js (only for the test).

```sh
python3 app/build.py                      # → dist/color-mapper.html and desktop/web/color-mapper.html
node app/test/roundtrip.js demo/benchy_8t.3mf

cd desktop
go test ./...
GOOS=windows GOARCH=amd64 go build -ldflags "-s -w" -o ColorMapperForPrusa.exe .
```

The page source is `app/index.src.html`, the 3MF engine is `app/core.js` (no dependencies). The Windows program (`desktop/`) only uses the Go standard library.

## License

Copyright © 2026 [DomiTech3D](https://github.com/DomiTech3D). Licensed under the **GNU General Public License v3.0** ([LICENSE](LICENSE)) with additional attribution terms ([NOTICE.md](NOTICE.md)).

In plain words (the license texts are what counts):

- You may use the Color Mapper for free, share it and change it.
- If you pass it on or publish a changed version, you must publish its source code under the same license.
- You must keep the credit **“Color Mapper for Prusa by DomiTech3D”** with a link to this project – visible in the user interface (page footer) and in the documentation.
- Changed versions must be marked as changed (for example “Based on Color Mapper for Prusa by DomiTech3D”) and must not be presented as the original.

## Notes

- Prusa, Prusa Connect, PrusaSlicer, CORE One, INDX and MMU3 are trademarks of Prusa Research a.s.; Spooly is a product of its developer; other product names belong to their owners.
- Always check the result in PrusaSlicer before printing.
- The sample model is the 3DBenchy, which NTI released into the public domain in 2025.
