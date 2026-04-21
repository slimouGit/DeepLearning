# EA2 Regression mit FFNN (Einfach erklaert)

## Was ist diese Anwendung?
Diese Webseite zeigt dir ganz einfach, wie ein neuronales Netz eine Kurve lernt.

Stell dir vor:
- Du hast Punkte auf einem Blatt Papier.
- Einige Punkte sind sauber (ohne Fehler), andere sind verrauscht (mit Messfehlern).
- Das Netz versucht eine passende Linie/Kurve durch diese Punkte zu finden.

Genau das macht die App - automatisch im Browser.

## Was passiert beim Start?
Beim Laden der Seite wird alles automatisch ausgefuehrt:
1. Es werden 100 Zufallswerte fuer x im Bereich [-2, 2] erzeugt.
2. Daraus werden y-Werte berechnet.
3. Es wird ein sauberer Datensatz und ein verrauschter Datensatz erstellt.
4. Die Daten werden zufaellig in 50 Training + 50 Test aufgeteilt.
5. Drei Modelle werden trainiert:
   - Clean-Modell (ohne Rauschen)
   - Best-Fit-Modell (mit Rauschen, moderate Anzahl Epochen)
   - Overfit-Modell (mit Rauschen, sehr viele Epochen)
6. Ergebnisse werden als Diagramme angezeigt.

## Was siehst du auf der Seite?
### R1
- Links: saubere Daten (Train + Test)
- Rechts: verrauschte Daten (Train + Test)

### R2
- Modell, das auf sauberen Daten trainiert wurde
- Links auf Trainingsdaten, rechts auf Testdaten

### R3
- Best-Fit-Modell auf verrauschten Daten
- Ziel: gute Generalisierung (kleiner Testfehler)

### R4
- Overfit-Modell auf verrauschten Daten
- Ziel: zeigen, dass Training sehr gut wird, Test aber schlechter

Unter R2, R3 und R4 steht jeweils:
- MSE_train
- MSE_test

So kannst du direkt vergleichen, ob ein Modell overfittet.

## Was bedeutet Overfitting (ganz einfach)?
Overfitting bedeutet:
- Das Modell merkt sich Trainingsdaten zu stark.
- Auf neuen (Test-)Daten macht es mehr Fehler.

Typisches Zeichen:
- MSE_train deutlich kleiner als MSE_test.

## Buttons erklaert
- Alles neu berechnen: Erzeugt neue Daten, trainiert alle Modelle neu, aktualisiert alle Plots.
- Datensatz speichern: Speichert den aktuellen Datensatz im Browser (localStorage).
- Datensatz laden: Laedt den gespeicherten Datensatz wieder.
- Modelle speichern: Speichert die trainierten Modelle im Browser (IndexedDB).
- Modelle laden: Laedt gespeicherte Modelle und bewertet sie auf dem aktuellen Datensatz.
- Modelle testen (MSE): Berechnet nur die MSE-Werte (Train/Test) fuer vorhandene Modelle.

## Technik in kurz
- TensorFlow.js: Bauen und Trainieren der neuronalen Netze im Browser.
- Plotly.js: Diagramme fuer Daten, Vorhersagen und Loss.
- localStorage: Datensatz speichern/laden.
- IndexedDB: Modelle speichern/laden.

## Warum ist das fuer die Aufgabe passend?
- Vorgaben fuer Modell, Loss, Optimizer, Lernrate, Batch-Size und Datenmenge sind umgesetzt.
- Clean, Best-Fit und Overfit werden getrennt gezeigt.
- Train- und Test-MSE werden explizit ausgewiesen.
- Alles ist dynamisch und laeuft ohne manuelle Eingriffe.

## Anwendung starten
1. Projekt auf einem Webserver oeffnen (z. B. XAMPP/Apache).
2. Diese Seite im Browser aufrufen:
   - EA2_RegressionMitFFNN/index.html
3. Die Resultate erscheinen automatisch nach dem Laden.
