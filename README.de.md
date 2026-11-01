# Farb-Mapper für Prusa (Color Mapper for Prusa)

[English](README.md) · **Deutsch**

> **Unabhängiges Projekt.** Der Farb-Mapper für Prusa ist ein kostenloses Community-Tool von [DomiTech3D](https://github.com/DomiTech3D).
> Er ist **nicht mit Prusa Research verbunden** (auch nicht mit Bambu Lab) und wird von Prusa weder unterstützt noch empfohlen.

Jede Farbe einer mehrfarbigen 3MF auf das richtige Tool deines Prusa-Druckers legen – im Browser, ohne neu zu bemalen.

Du hast ein bemaltes Modell für Bambu Studio, OrcaSlicer oder PrusaSlicer gefunden, aber die Farben liegen auf anderen Extrudern als die Filamente in deinem Drucker. Der Farb-Mapper zeigt das Modell in 3D, du legst jede Farbe der Datei auf eines deiner Tools oder MMU-Slots, und er speichert eine 3MF für PrusaSlicer mit entsprechend verschobener Bemalung.

![Farb-Mapper für Prusa mit dem 8-farbigen 3DBenchy als Beispiel](docs/screenshot-de.png)

## Funktionen

- Öffnet 3MF-Projekte aus **Bambu Studio, OrcaSlicer und PrusaSlicer** (bemalte Modelle und Farben pro Objekt)
- 3D-Vorschau mit den Farben der Datei oder mit deinen geladenen Filamenten; mit der Maus über eine Farbe oder ein Tool fahren zeigt genau, welche Flächen es druckt
- Automatische Zuordnung nach Farbähnlichkeit, pro Farbe mit einem Klick änderbar
- Deine Tool-Farben bleiben pro Drucker im Browser gespeichert
- Englisch und Deutsch, oben rechts umschaltbar
- Alles läuft lokal: deine 3MF-Dateien werden nirgends hochgeladen
- Optional unter Windows: **Live-Farben aus Prusa Connect** (inoffiziell, siehe unten)

## Unterstützte Drucker

| Drucker | Tools |
|---|---|
| CORE One INDX, CORE One L INDX | 4 oder 8 Tools |
| CORE One, CORE One L, MK4S, MK3.9S, MK3.5S mit MMU3 | 5 Slots |
| Prusa XL, XL+ | 5 oder 2 Tools |

## So nutzt du ihn

Es gibt zwei Wege. Beide sind derselbe Farb-Mapper, das Windows-Programm bringt nur zusätzlich die Live-Farben aus Prusa Connect.

| | Web-Version | Windows-Programm |
|---|---|---|
| Installation | keine | `ColorMapperForPrusa.exe` herunterladen und starten |
| Läuft auf | jedem Computer oder Tablet mit aktuellem Browser (Windows, macOS, Linux) | Windows |
| 3MF öffnen, zuordnen, speichern | ja | ja |
| Tool-Farben | einmal pro Drucker von Hand, der Browser merkt sie sich | automatisch aus Prusa Connect, alle 30 Sekunden |

### Web-Version (für den Anfang empfohlen)

- **Online:** `https://DomiTech3D.github.io/color-mapper-for-prusa/`
- **Offline:** `color-mapper.html` aus dem [neusten Release](../../releases/latest) herunterladen und in Chrome, Edge, Firefox oder Safari öffnen.

Die Seite startet auf Englisch – oben rechts auf **DE** klicken, der Browser merkt sich die Wahl.

1. Bei **Drucker** deinen Drucker wählen.
2. Die Farbe jedes Tools oder Slots einstellen: antippen und die Farbe des geladenen Filaments wählen. Das machst du einmal, der Browser merkt es sich.
3. Die 3MF-Datei auf die Seite ziehen.
4. Zuordnung prüfen – jede Farbe der Datei bekommt ein Tool. **Automatisch nach Farbe zuordnen** erledigt das für dich; mit der Maus über eine Zeile fahren zeigt, wo die Farbe vorkommt.
5. **Für PrusaSlicer speichern** klicken.

### Ergebnis in PrusaSlicer öffnen

1. Im PrusaSlicer deinen Drucker wählen (zum Beispiel den CORE One INDX).
2. Datei ins Fenster ziehen oder **Datei → Importieren → STL/3MF/STEP/OBJ/AMF** (Ctrl+I).
3. Fragt PrusaSlicer «Als Projekt öffnen oder nur Geometrie importieren?», **nur Geometrie** wählen, damit dein Drucker-Profil bleibt.
4. Vor dem Drucken die Bemalung mit dem Werkzeug **Multi-Material-Bemalung** (Taste N) kontrollieren.

### Windows-Programm mit Live-Farben aus Prusa Connect (optional)

`ColorMapperForPrusa.exe` stellt den Farb-Mapper auf deinem eigenen Computer bereit und liest alle 30 Sekunden aus Prusa Connect, welches Filament in jedem Tool oder MMU-Slot steckt. Legst du eine neue Spule ein, ändert sich die Farbe von selbst.

1. `ColorMapperForPrusa.exe` aus dem [neusten Release](../../releases/latest) herunterladen und starten. Ein schwarzes Fenster geht auf, der Farb-Mapper öffnet sich im Browser.
2. **Mit Prusa Connect verbinden** klicken und auf der Prusa-Seite anmelden.
3. Das schwarze Fenster offen lassen, solange du den Farb-Mapper nutzt. Schliessen beendet das Programm.

**«Der Computer wurde durch Windows geschützt»:** Das Programm ist nicht signiert, deshalb warnt Windows SmartScreen beim ersten Start. **Weitere Informationen → Trotzdem ausführen** klicken. Ob die Datei wirklich von GitHub aus diesem Quellcode gebaut wurde, lässt sich prüfen:

```
gh attestation verify ColorMapperForPrusa.exe --repo DomiTech3D/color-mapper-for-prusa
```

oder den SHA-256 (`Get-FileHash ColorMapperForPrusa.exe` in PowerShell) mit `SHA256SUMS.txt` aus dem Release vergleichen.

**Was das Windows-Programm tut und speichert**

- Es ist nur auf `127.0.0.1:8765` erreichbar (dein eigener Computer) und lehnt Anfragen von anderen Websites ab.
- Du meldest dich auf der Anmeldeseite von Prusa an; das Programm sieht dein Passwort nie.
- Die Anmeldung wird in `%APPDATA%\ColorMapperForPrusa` gespeichert, von Windows verschlüsselt (DPAPI), nur dein Windows-Benutzer kann sie lesen. **Verbindung trennen** löscht sie.
- Es liest nur deine Drucker und das Filament in jedem Tool. Zugangsschlüssel landen nie im Protokoll.

## Zur Verbindung mit Prusa Connect (inoffiziell)

- Prusa bietet für fremde Programme keine öffentliche Schnittstelle an. Das Windows-Programm nutzt dieselbe, **nicht dokumentierte** Schnittstelle, die auch die Prusa-Connect-Webseite selbst verwendet.
- Prusa kann diese Schnittstelle jederzeit ändern. **Die Live-Farben können deshalb in Zukunft ohne Vorwarnung nicht mehr funktionieren.** Sie werden ohne Gewähr angeboten.
- **Die Web-Version hängt nicht von Prusa Connect ab und wird weiterhin unterstützt** – ohne automatische Filament-Synchronisierung: Die Tool-Farben stellst du von Hand ein (einmal pro Drucker, der Browser merkt sie sich). Auch das Windows-Programm funktioniert so weiter, falls die Verbindung einmal ausfällt.

## Häufige Fragen

**Funktioniert das auch für Bambu-Lab-Drucker?**
Dateien aus Bambu Studio und OrcaSlicer lassen sich *öffnen*, das Ergebnis ist aber immer ein PrusaSlicer-Projekt für einen Prusa-Drucker.

**Geht das auch auf dem Mac?**
Ja, die Web-Version funktioniert in Safari, Chrome und Firefox. Das Windows-Programm mit Live-Farben gibt es nur für Windows.

**Wird meine Originaldatei verändert?**
Nein. Es wird immer eine neue Datei gespeichert (`…_INDX.3mf`, `…_MMU3.3mf`, `…_XL.3mf` oder `…_umgemappt.3mf`).

**Warum wird beim Darüberfahren manches grau?**
Absichtlich: Nur die Flächen der Farbe oder des Tools unter dem Mauszeiger bleiben farbig.

## Selbst bauen

Benötigt: Python 3, Go 1.22 oder neuer, Node.js (nur für den Test).

```sh
python3 app/build.py                      # → dist/color-mapper.html und desktop/web/color-mapper.html
node app/test/roundtrip.js demo/benchy_8t.3mf

cd desktop
go test ./...
GOOS=windows GOARCH=amd64 go build -ldflags "-s -w" -o ColorMapperForPrusa.exe .
```

**Release veröffentlichen:** auf GitHub ein Release mit neuem Tag wie `v1.2.1` erstellen (Releases → Draft a new release). Der Workflow *Release* baut dann `ColorMapperForPrusa.exe` und `color-mapper.html`, hält die Herkunft des Builds fest und hängt die Dateien ans Release. Der Workflow *Web version* veröffentlicht die Seite nach jeder Änderung auf `main` auf GitHub Pages (einmalig einrichten: Settings → Pages → Source: **GitHub Actions**).

## Lizenz

Copyright © 2026 [DomiTech3D](https://github.com/DomiTech3D). Lizenziert unter der **GNU General Public License v3.0** ([LICENSE](LICENSE)) mit zusätzlichen Bedingungen zur Namensnennung ([NOTICE.md](NOTICE.md)).

In einfachen Worten (massgebend sind die Lizenztexte):

- Du darfst den Farb-Mapper kostenlos nutzen, weitergeben und verändern.
- Wer ihn weitergibt oder eine veränderte Version veröffentlicht, muss deren Quellcode unter derselben Lizenz offenlegen.
- Der Hinweis **«Color Mapper for Prusa by DomiTech3D»** (bzw. «Farb-Mapper für Prusa von DomiTech3D») mit Link zu diesem Projekt muss erhalten bleiben – sichtbar in der Oberfläche (Fusszeile der Seite) und in der Dokumentation.
- Veränderte Versionen müssen als verändert gekennzeichnet sein (zum Beispiel «Based on Color Mapper for Prusa by DomiTech3D») und dürfen nicht als Original ausgegeben werden.

## Hinweise

- Prusa, Prusa Connect, PrusaSlicer, CORE One, INDX und MMU3 sind Marken von Prusa Research a.s.; andere Produktnamen gehören ihren Inhabern.
- Das Ergebnis vor dem Drucken immer in PrusaSlicer kontrollieren.
- Das Beispielmodell ist der 3DBenchy, den NTI 2025 als gemeinfrei freigegeben hat.
