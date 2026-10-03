# Pensionen, Zimmertypen, echte Zimmer + CSV-Import (nur Vorschau bis zur Freigabe)

## Kurze Analyse (Ist-Zustand)
- **Warum die Zimmertypen „verschwunden" wirken:** Sie sind nicht weg. Man erreicht sie nur über Pensionen → Karte → „Zimmer verwalten". Das alte Fenster „Zimmertypen & Preise" (`room-types-dialog.tsx`) wurde früher entfernt und wird nicht mehr benutzt. Es gibt keine Reiter und keinen klaren Einstieg.
- **Daten heute:** 6 Pensionen, 24 Zimmer und 1 Zimmertyp („testt", Bünde Vinckestr.).
  - Es gibt **keine** Zimmertypen ohne Pension.
  - Es gibt keine doppelten Zimmernummern.
- **Regeln, die schon in der Datenbank gelten:**
  - Ein Zimmertyp braucht immer eine Pension.
  - Der Code eines Zimmertyps ist pro Pension eindeutig.
  - Die Zimmernummer ist pro Pension eindeutig.
  - Ein Zimmer kann keinen Typ einer anderen Pension bekommen.
  - Daten anderer Firmen sind getrennt.
  - Typ und Preis werden zusammen gespeichert. Mehrere Zimmer werden in einem Schritt angelegt.
  - Daher ist keine Umwandlung alter Daten nötig.
- **CSV-Dateien:**
  - Die Zimmerdatei enthält 84 echte Zimmer an 10 Adressen. Die Angebotsdatei enthält 30 Anzeigen.
  - Davon sind 6 Adressen schon als Pension vorhanden.
  - 4 Adressen sind neu: Bielefeld Paderborner Str. (29), Bünde Semmelweg (3), Löhne Johanneskamp (3), Pr. Oldendorf Goethestr. (5).
  - Bei den vorhandenen 6 Pensionen liegen heute nur 4 Zimmer je Haus vor, die CSV enthält mehr (z. B. Borriestr. 13). Hier muss entschieden werden, ob ein bestehendes Zimmer einem CSV-Zimmer entspricht.

## 1. Pensions-Detailseite mit Reitern
Die Seite „Zimmer verwalten" wird zur Pensions-Detailseite mit 5 Reitern:
1. **Übersicht:** Zahlen je Typ: gesamt, belegt, frei, in Reinigung, Wartung.
2. **Zimmertypen:** anlegen, bearbeiten, aktiv/inaktiv, löschen. Felder: Name, Code, Kapazität, Grundbelegung, Beschreibung, Grundpreis.
3. **Zimmer:** einzeln oder mehrere auf einmal anlegen.
   - Die Pension ist schon gesetzt, es erscheinen nur ihre Typen.
   - Felder: Nummer, Etage, Status, Notiz, Standard-Reinigungskraft.
4. **Preise:** Gesamtpreis je Personenzahl, z. B. DZ: 1 Person 80 €, 2 Personen 100 €.
   - Basis sind die vorhandenen Preispläne und Personenpreise.
   - Eine Buchung sperrt immer das ganze Zimmer.
5. **Kanal-Zuordnung:** nur der Hinweis „in Vorbereitung".

**Mehrere Zimmer anlegen:**
- Eingabe entweder als Startnummer + Anzahl (z. B. 101 + 5) oder als Liste (101, 102, 105).
- Man sieht vorher die Liste der neuen Zimmer und kann einzelne Nummern ändern.

**Löschen eines Typs mit Zimmern:** Es erscheint ein Fenster mit drei Wahlmöglichkeiten:
- „Inaktiv setzen"
- „Zimmer zu anderem Typ verschieben"
- „Abbrechen"

Typen mit Buchungen, Preisen oder Kanal-Zuordnung werden nie gelöscht, nur inaktiv gesetzt.

## 2. Datenimport (nur Inhaber/Admin)
Neue Seite **Einstellungen → Datenimport** mit 4 Schritten:
1. **Dateien hochladen:** Die Dateien werden nur im Browser gelesen. Es wird noch nichts gespeichert.
2. **Pensionen zuordnen:** Für jede der 10 Adressen wird ein Vorschlag angezeigt: bestehende Pension, neue Pension oder mit einer anderen Adresse zusammenlegen.
3. **Zimmertypen und Zimmer prüfen:**
   - Typvorschläge pro Pension nach der Typliste aus der Anweisung. „mit eigenem Bad" und „mit eigener Dusche" bleiben eigene Typen.
   - Bei Familienzimmer und Ferienwohnung muss die Kapazität bestätigt werden.
   - „01/02" aus dem Titel wird nur als Nummer vorgeschlagen und bleibt änderbar.
   - Wenn die Etage fehlt, bleibt sie leer und wird als „prüfen" markiert.
   - Konflikte mit bestehenden Zimmern werden angezeigt. Pro Zimmer wählt man: neu anlegen, mit bestehendem Zimmer verknüpfen oder überspringen.
4. **Vorschau und Freigabe:**
   - Erst nach einem ausdrücklichen Klick auf „Import ausführen" wird gespeichert. Alles wird in einem Schritt gespeichert oder gar nichts.
   - Danach erscheint ein Ergebnis mit: neuen Pensionen, Typen, Zimmern, aktualisierten, übersprungenen und fehlerhaften Einträgen sowie Einträgen zur Prüfung.
   - Dazu kommt der Hinweis: „21 der gemeldeten 105 Zimmer fehlen in der Datei und wurden nicht angelegt."

Text aus der CSV wird nie als HTML angezeigt, nur als reiner Text.

## 3. Grenzen
- Kein Kontakt zu WuBook.
- Keine Kanal-Ereignisse.
- Nichts wird automatisch zum Verkauf freigegeben.
- Keine bestehenden Daten werden gelöscht.
- **Der Import wird in diesem Schritt nur gebaut, aber nicht mit deinen Daten ausgeführt.** Das machst du selbst über die neue Seite, nachdem du die Vorschau geprüft hast.

## Technische Details
- **Migration (nur Ergänzungen):**
  - Neue Spalten in `rooms`, `room_types` und `properties`: `source_system`, `external_source_id`, `source_url`, `import_batch_id`, `import_needs_review`.
  - Dazu ein eindeutiger Index (`organization_id, source_system, external_source_id`), der nur gilt, wenn eine externe ID gesetzt ist.
  - `rooms.active` (Standard: true).
- **Neue RPCs** (SECURITY DEFINER; Firma wird auf dem Server bestimmt; nur owner/admin):
  - `import_wp_rooms(_batch jsonb)`: alles in einer Transaktion. Bei erneutem Import wird nach der externen ID aktualisiert statt doppelt angelegt. Schreibt ins `audit_logs` (Nutzer, Datei, Zahlen).
  - `set_room_type_active`
  - `move_rooms_to_type`
  - `save_occupancy_prices`
  - `save_room_type_with_plan` wird um Code, Beschreibung und Grundbelegung erweitert.
- **Kein Ereignis an `integration_outbox`:**
  - Beim Import wird der Outbox-Trigger über ein lokales Session-Flag übersprungen.
  - Preisänderungen im Reiter „Preise" erzeugen weiter nur die bestehenden Dry-Run-Einträge, es wird nichts gesendet.
- **CSV-Parser:**
  - Läuft im Browser, mit einer eigenen Logik für mehrzeilige Felder in Anführungszeichen.
  - Die reine Erkennungslogik liegt in `src/lib/import/wp-rooms.ts` und hat Vitest-Tests: 84 Zimmer, 10 Adressgruppen, Typzuordnung.
- **Dateien:** `property-rooms-view.tsx` (Reiter), neue Komponenten für Reiter, Datenimport-Route, i18n de/en/tr, `room-types-dialog.tsx` wird gelöscht (wird nicht benutzt).
- **SQL-Tests** in `supabase/tests/room_import.sql`, die Punkte 1–6 und 9–13 der Anweisung abdecken. Diese Test-Umgebung darf die Funktionen nicht ausführen. Das wird ehrlich berichtet.
