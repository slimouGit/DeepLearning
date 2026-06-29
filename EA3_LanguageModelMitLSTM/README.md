# LSTM Language Model mit TensorFlow.js

## Start

1. Ordner entpacken.
2. Einen lokalen Webserver starten, z. B.:
   ```bash
   python -m http.server 8000
   ```
3. Im Browser öffnen:
   ```text
   http://localhost:8000
   ```

## Umsetzung

- Tokenisierung und Dictionary-Erstellung im Browser
- Trainingssequenzen: n vorherige Wörter -> nächstes Wort
- Modell: Embedding -> LSTM(100) -> LSTM(100) -> Dense Softmax
- Loss: categoricalCrossentropy
- Optimizer: Adam
- Batch Size: 32
- Top-k-Auswertung für k = 1, 5, 10, 20, 100
- Perplexity-Berechnung
- Interaktion: Vorhersage, Weiter, Auto, Stopp, Reset
- Rekonstruktionstest (Memorization/Datenschutz-Risiko)
- Diagramme: Loss-Verlauf und Top-k-Trefferquote

## Abdeckung der Aufgabenstellung

- I1: Prompt eingeben, Vorhersage auslösen, eines der vorgeschlagenen Wörter anklicken (wird angehängt und erneut vorhergesagt).
- I2: Weiter übernimmt Top-1 Vorhersage und startet automatisch die nächste Vorhersage.
- I3: Auto generiert bis zu 10 Wörter, Stopp unterbricht jederzeit.
- I4: Reset setzt Prompt, Datenstatus, Modellzustand und Visualisierung zurück.

## Experimente

1. Architektur variieren über LSTM-Units, Embedding-Dimension, Lernrate und Epochen.
2. Resultate über Top-k (1, 5, 10, 20, 100), Cross-Entropy und Perplexity dokumentieren.
3. Rekonstruktionstest starten und diskutieren, ob Trainingsmuster reproduziert werden.

## Hinweis

Für größere Datensätze ist Browser-Training langsam. Für die Abgabe sollte zuerst mit kleinem Text getestet werden.
