# Farb-Mapper für Prusa (Color Mapper for Prusa)

[English](README.md) · **Deutsch**

> **Unabhängiges Projekt.** Der Farb-Mapper für Prusa ist ein kostenloses Community-Tool von [DomiTech3D](https://github.com/DomiTech3D).
> Er ist **nicht mit Prusa Research verbunden** (auch nicht mit Bambu Lab oder Spooly) und wird von Prusa weder unterstützt noch empfohlen.

Jede Farbe einer mehrfarbigen 3MF auf das richtige Tool deines Prusa-Druckers legen – im Browser, ohne neu zu bemalen.

Du hast ein bemaltes Modell für Bambu Studio, OrcaSlicer oder PrusaSlicer gefunden, aber die Farben liegen auf anderen Extrudern als die Filamente in deinem Drucker. Der Farb-Mapper zeigt das Modell in 3D, du legst jede Farbe der Datei auf eines deiner Tools oder einen deiner MMU-Slots, und er speichert eine 3MF für PrusaSlicer mit entsprechend verschobener Bemalung.

![Farb-Mapper für Prusa mit dem 8-farbigen 3DBenchy als Beispiel](docs/screenshot-de.png)

## Funktionen

**Überall (Web-Version und Windows-Programm)**

- Öffnet 3MF-Projekte aus **Bambu Studio, OrcaSlicer und PrusaSlicer** (bemalte Modelle und Farben pro Objekt)
- 3D-Vorschau mit den Farben der Datei oder mit deinen geladenen Filamenten; mit der Maus über eine Farbe oder ein Tool fahren zeigt genau, welche Flächen es druckt
- **Automatische Zuordnung nach Farbähnlichkeit und Farbfamilie** – Braun geht auf dein braunes Filament, nicht auf das rote –, pro Farbe mit einem Klick änderbar
- Deine Tool-Farben bleiben pro Drucker im Browser gespeichert
- Englisch und Deutsch, oben rechts umschaltbar
- Alles läuft lokal: deine 3MF-Dateien werden nirgends hochgeladen

**Windows-Programm (optional)**

- **Live-Farben aus Prusa Connect** (inoffiziell) – das Filament in jedem Tool oder MMU-Slot, alle 30 Sekunden aktualisiert
- **Oder live aus [Spooly](https://spooly.eu)** (offizielle Schnittstelle), mit noch mehr:
  - Restgewicht pro Tool und Warnung, wenn eine Spule knapp wird
  - für jede Farbe deiner Datei **die passendste Spule aus deinem ganzen Lager** – geladen oder nicht –, auf ein Tool eingeplant
  - für jedes Tool selbst eine Spule aus dem Lager wählen, mit Lagerort
  - optional: geplante Spulen mit einem Klick in Spooly eintragen
- Leere Tools werden als leer angezeigt und beim automatischen Zuordnen nicht verwendet
- Unter **Zuordnung** zeigt jede Farbe der Datei, was genau im gewählten Tool liegt (oder geplant ist)
- **Details** zeigt Drucker, Aktualisierungszeit und jedes Tool mit Spule, Material, Restgewicht und Lagerort
- Ein Hinweis, wenn ein Druck Materialien mischen würde (zum Beispiel PLA und ASA)

## Unterstützte Drucker

| Drucker | Tools |
|---|---|
| CORE One INDX, CORE One L INDX | 4 oder 8 Tools |
| CORE One, CORE One L, MK4S, MK3.9S, MK3.5S mit MMU3 | 5 Slots |
| Prusa XL, XL+ | 5 oder 2 Tools |

Getestet an einem echten CORE One INDX. Die anderen Drucker nutzen dasselbe Dateiformat und dieselben Daten aus Prusa Connect und Spooly, wurden aber noch nicht an echter Hardware ausprobiert – Rückmeldungen sind willkommen.

## Web-Version oder Windows-Programm?

Beide sind derselbe Farb-Mapper. Das Windows-Programm bringt zusätzlich die Live-Farben aus Prusa Connect oder Spooly.

| | Web-Version | Windows-Programm |
|---|---|---|
| Installation | keine | `ColorMapperForPrusa.exe` herunterladen und starten |
| Läuft auf | jedem Computer oder Tablet mit aktuellem Browser (Windows, macOS, Linux) | Windows |
| 3MF öffnen, zuordnen, speichern | ja | ja |
| Tool-Farben | einmal pro Drucker von Hand, der Browser merkt sie sich | automatisch aus Prusa Connect oder Spooly |
| Spulen aus deinem Spooly-Lager | – | ja |

## Web-Version

- **Online:** [domitech3d.github.io/color-mapper-for-prusa](https://domitech3d.github.io/color-mapper-for-prusa/)
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

## Windows-Programm

1. `ColorMapperForPrusa.exe` aus dem [neusten Release](../../releases/latest) herunterladen und starten. Ein schwarzes Fenster geht auf, der Farb-Mapper öffnet sich im Browser.
2. Oben im Live-Kasten die Quelle der Tool-Farben wählen: **Prusa Connect** oder **Spooly** (siehe unten).
3. Das schwarze Fenster offen lassen, solange du den Farb-Mapper nutzt. Schliessen beendet das Programm.

**«Der Computer wurde durch Windows geschützt»:** Das Programm ist nicht signiert, deshalb warnt Windows SmartScreen beim ersten Start. **Weitere Informationen → Trotzdem ausführen** klicken. Blockiert dein Browser oder deine Firma das Herunterladen von `.exe`-Dateien, geht das Windows-Programm auf diesem Computer nicht – die Web-Version funktioniert auch ohne.

*Optional – Download prüfen:* Die Dateien in den Releases baut GitHub direkt aus diesem Quellcode. Vergleiche den SHA-256 (`Get-FileHash ColorMapperForPrusa.exe` in PowerShell) mit `SHA256SUMS.txt` aus dem Release, oder führe mit dem [GitHub CLI](https://cli.github.com/) `gh attestation verify ColorMapperForPrusa.exe --repo DomiTech3D/color-mapper-for-prusa` aus.

### Live-Farben aus Prusa Connect

1. Im Live-Kasten **Prusa Connect** wählen und **Mit Prusa Connect verbinden** klicken.
2. Auf der Prusa-Seite anmelden, die sich öffnet. Das Programm sieht dein Passwort nie.
3. Hast du mehrere Drucker, wähle deinen bei **Drucker**. Das passende Drucker-Profil wird automatisch gewählt.

Die Farben werden alle 30 Sekunden aktualisiert. Legst du eine neue Spule ein, ändert sich die Farbe von selbst. Ein Tool ohne Filament in Prusa Connect erscheint als leer. Du kannst einem Tool trotzdem eine eigene Farbe geben, indem du es antippst; **↺ Connect** übernimmt wieder die Farbe aus Prusa Connect.

### Live-Farben und Lager aus Spooly

[Spooly](https://spooly.eu) ist eine Filament-Verwaltung. Über die offizielle Schnittstelle liest der Farb-Mapper, welche Spule in welchem Slot steckt und was du an Lager hast.

![Das Windows-Programm mit Spooly: Live-Farben, eine Spule aus dem Lager für T2 eingeplant, und die Details](docs/screenshot-spooly-de.png)

**Du brauchst**

- ein Spooly-Konto mit **Pro** (oder der Testphase) und **API-Zugang** (die Schnittstelle ist im Moment eine Beta – Zugang bei Spooly anfragen)
- deinen Drucker in Spooly mit seinen Slots eingerichtet (beim INDX: Slots 1-1 bis 1-8)
- das Windows-Programm – Spooly erlaubt keinen Zugriff aus Webseiten, deshalb geht das nicht in der Web-Version

**Einrichten**

1. In Spooly einen **persönlichen API-Schlüssel** erstellen (er beginnt mit `spk_`). Für die Live-Farben genügt Lesen. Nur das optionale *Eintragen von Spulen in Spooly* (siehe unten) braucht einen Schlüssel, der schreiben darf.
2. `ColorMapperForPrusa.exe` starten und den Live-Kasten von **Prusa Connect** auf **Spooly** umschalten.
3. Schlüssel einfügen und **Mit Spooly verbinden** klicken. Der Schlüssel wird sofort geprüft.
4. Unter **Details** kontrollieren, dass jedes Tool die richtige Spule zeigt.

**So funktioniert es**

- **Tool-Farben:** kommen von den Spulen in deinen Spooly-Slots und werden etwa jede Minute aktualisiert. Das Drucker-Profil wird anhand des Druckermodells gewählt (zum Beispiel `COREONE_INDX8T`). Unter jedem Tool stehen Material und Restgewicht; knappe Spulen werden markiert.
- **Beste Spule für deine Datei:** Beim Öffnen einer Datei bekommt jede Farbe die Spule aus Spooly, die am besten passt – geladen oder im Lager:
  - Eine geladene Spule gewinnt, wenn sie praktisch gleich gut passt, damit du nicht unnötig wechselst.
  - Es werden nur Spulen im Material der Datei genommen (PLA für PLA), ausser keine davon passt.
  - Lager-Spulen kommen zuerst in ein Tool mit praktisch gleicher Farbe (zum Beispiel schwarzes PLA in das Tool mit schwarzem ASA), dann in leere Slots, dann in ein Tool, das der Druck nicht braucht und dessen bisherige Farbe am ähnlichsten ist – kein Schwarz in ein Tool, das vorher weiss gedruckt hat. Tools, die der Druck braucht, werden nie ersetzt.
  - Fast leere Spulen kommen zuletzt.
  - Eine Meldung sagt, was eingeplant wurde und welche Spule dafür ersetzt würde. **Verwerfen** nimmt einen Plan zurück, **Automatisch nach Farbe zuordnen** plant erneut. Beim Beispielmodell, das beim Start erscheint, passiert nichts.
- **Spule selbst wählen:** Der Spulen-Knopf (◎) unter jedem Tool öffnet dein Lager – durchsuchbar, mit Restgewicht, Lagerort und wo eine Spule gerade steckt. Zur Datei passende Spulen stehen zuoberst.
- **Pläne sind nur Pläne:** Spooly wird nicht verändert. Geplante Spulen stehen mit Lagerort unter den Tools, so weisst du, was wohin gehört. Sobald Spooly die geplante Spule in diesem Slot meldet, ist der Plan erledigt.

**Optional: Spulen in Spooly eintragen**

**Spulen in Spooly eintragen erlauben** anhaken (standardmässig aus). Dann bekommt jede geplante Spule einen Knopf **In Spooly eintragen**, und im Spulen-Fenster lässt sich ein Slot in Spooly leeren. Ohne einen dieser Klicks wird in Spooly nichts geändert.

- Das braucht in Spooly den **Slot-Autopiloten** und einen Schlüssel, der schreiben darf.
- Meldet der Drucker für den Slot eine andere Farbe, fragt der Farb-Mapper zuerst nach (**Trotzdem eintragen**).

**Gut zu wissen**

- **Jeden Slot einmal in Spooly zuweisen.** Spooly bietet einen Slot der Schnittstelle erst an, wenn ihm einmal in Spooly eine Spule zugewiesen wurde. Ein nie benutzter Slot fehlt – er lässt sich aus dem Farb-Mapper nicht eintragen, und im Programm-Protokoll steht *«fehlt in GET /slots»*. Abhilfe: dem Slot in Spooly einmal irgendeine Spule zuweisen (danach darfst du ihn wieder leeren).
- Der Schlüssel wird verschlüsselt (Windows DPAPI) in `%APPDATA%\ColorMapperForPrusa` gespeichert, nie mehr angezeigt und nie protokolliert. **Verbindung trennen** löscht ihn.
- Das Programm fragt Spooly nur, solange der Farb-Mapper offen ist: etwa zwei Abfragen pro Minute, das Lager alle fünf Minuten. Das Tageslimit von Spooly (10'000 Abfragen) ist weit weg.
- Der Farb-Mapper kann nicht beurteilen, ob eine Spule für den Druck *genug* Filament hat: Eine 3MF-Datei enthält keinen Verbrauch – den rechnet erst der Slicer.
- Spooly ist ein eigenständiges Produkt; dieses Projekt ist nicht mit Spooly verbunden.

**Wenn etwas nicht klappt**

| Meldung | Was tun |
|---|---|
| Spooly nimmt diesen Schlüssel nicht an | Schlüssel nochmals vollständig kopieren (beginnt mit `spk_`); sonst in Spooly einen neuen erstellen. |
| Spooly verweigert den Zugriff | Dein Spooly-Konto braucht Pro (oder die Testphase) und API-Zugang. |
| Spooly liefert T2 noch nicht in seiner Slot-Liste | Dem Slot in Spooly einmal eine Spule zuweisen (siehe *Gut zu wissen*). |
| Spooly führt T2 ohne Slot-ID | In Spooly den Slot-Autopiloten für diesen Drucker einschalten. |
| Spooly erlaubt diesem Schlüssel keine Änderungen an Slots | Einen Schlüssel mit Schreibrecht erstellen, oder das Eintragen ausgeschaltet lassen. |
| Das Tageslimit von Spooly ist aufgebraucht | Am nächsten Tag werden die Farben wieder aktualisiert. |

Das **Protokoll des Programms** unten im Live-Kasten zeigt, welche Slots Spooly für jeden Drucker anbietet.

### Was das Windows-Programm tut und speichert

- Es ist nur auf `127.0.0.1:8765` erreichbar (dein eigener Computer) und lehnt Anfragen von anderen Websites ab.
- Prusa Connect: Du meldest dich auf der Prusa-Seite an; die Anmeldung wird verschlüsselt (Windows DPAPI) in `%APPDATA%\ColorMapperForPrusa` gespeichert. Es liest nur deine Drucker und das Filament in jedem Tool.
- Spooly: Der API-Schlüssel wird gleich gespeichert. Das Programm liest Drucker, Slots und Spulen; in Spooly schreibt es nur, wenn du **In Spooly eintragen** klickst oder einen Slot leerst.
- **Verbindung trennen** löscht die gespeicherte Anmeldung bzw. den Schlüssel. Zugangsschlüssel landen nie im Protokoll.

## Zur Verbindung mit Prusa Connect (inoffiziell)

- Prusa bietet für fremde Programme keine öffentliche Schnittstelle an. Das Windows-Programm nutzt dieselbe, **nicht dokumentierte** Schnittstelle, die auch die Prusa-Connect-Webseite selbst verwendet.
- Prusa kann diese Schnittstelle jederzeit ändern. **Die Live-Farben aus Prusa Connect können deshalb in Zukunft ohne Vorwarnung nicht mehr funktionieren.** Sie werden ohne Gewähr angeboten.
- **Die Web-Version hängt nicht von Prusa Connect ab und wird weiterhin unterstützt** – ohne automatische Filament-Synchronisierung: Die Tool-Farben stellst du von Hand ein (einmal pro Drucker, der Browser merkt sie sich).
- Die Verbindung zu Spooly nutzt die offizielle Schnittstelle von Spooly und ist davon nicht betroffen.

## Häufige Fragen

**Funktioniert das auch für Bambu-Lab-Drucker?**
Dateien aus Bambu Studio und OrcaSlicer lassen sich *öffnen*, das Ergebnis ist aber immer ein PrusaSlicer-Projekt für einen Prusa-Drucker.

**Geht das auch auf dem Mac?**
Ja, die Web-Version funktioniert in Safari, Chrome und Firefox. Das Windows-Programm mit Live-Farben gibt es nur für Windows.

**Wird meine Originaldatei verändert?**
Nein. Es wird immer eine neue Datei gespeichert (`…_INDX.3mf`, `…_MMU3.3mf`, `…_XL.3mf` oder `…_umgemappt.3mf`).

**Prüft er, ob eine Spule genug Filament hat?**
Nein. Eine 3MF-Datei enthält keinen Filamentverbrauch; den rechnet erst der Slicer (er hängt von Infill, Wänden, Stützen und Spülturm ab). Der Farb-Mapper zeigt das Restgewicht aus Spooly, damit du es selbst einschätzen kannst.

**Warum wird beim Darüberfahren manches grau?**
Absichtlich: Nur die Flächen der Farbe oder des Tools unter dem Mauszeiger bleiben farbig.

## Rückmeldungen

Das ist ein Hobbyprojekt und mein erstes auf GitHub – Rückmeldungen sind sehr willkommen. Einen Fehler gefunden, eine 3MF, die nicht klappt, oder eine Idee? Bitte [ein Issue eröffnen](../../issues). Bei Problemen mit einer bestimmten Datei hilft eine kurze Beschreibung: welcher Drucker, aus welchem Slicer die Datei stammt und was schiefging.

## Selbst bauen

Benötigt: Python 3, Go 1.22 oder neuer, Node.js (nur für den Test).

```sh
python3 app/build.py                      # → dist/color-mapper.html und desktop/web/color-mapper.html
node app/test/roundtrip.js demo/benchy_8t.3mf

cd desktop
go test ./...
GOOS=windows GOARCH=amd64 go build -ldflags "-s -w" -o ColorMapperForPrusa.exe .
```

## Lizenz

Copyright © 2026 [DomiTech3D](https://github.com/DomiTech3D). Lizenziert unter der **GNU General Public License v3.0** ([LICENSE](LICENSE)) mit zusätzlichen Bedingungen zur Namensnennung ([NOTICE.md](NOTICE.md)).

In einfachen Worten (massgebend sind die Lizenztexte):

- Du darfst den Farb-Mapper kostenlos nutzen, weitergeben und verändern.
- Wer ihn weitergibt oder eine veränderte Version veröffentlicht, muss deren Quellcode unter derselben Lizenz offenlegen.
- Der Hinweis **«Color Mapper for Prusa by DomiTech3D»** (bzw. «Farb-Mapper für Prusa von DomiTech3D») mit Link zu diesem Projekt muss erhalten bleiben – sichtbar in der Oberfläche (Fusszeile der Seite) und in der Dokumentation.
- Veränderte Versionen müssen als verändert gekennzeichnet sein (zum Beispiel «Based on Color Mapper for Prusa by DomiTech3D») und dürfen nicht als Original ausgegeben werden.

## Hinweise

- Prusa, Prusa Connect, PrusaSlicer, CORE One, INDX und MMU3 sind Marken von Prusa Research a.s.; Spooly ist ein Produkt seines Entwicklers; andere Produktnamen gehören ihren Inhabern.
- Das Ergebnis vor dem Drucken immer in PrusaSlicer kontrollieren.
- Das Beispielmodell ist der 3DBenchy, den NTI 2025 als gemeinfrei freigegeben hat.
