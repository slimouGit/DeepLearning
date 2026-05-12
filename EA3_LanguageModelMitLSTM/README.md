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
- Modell: Embedding -> LSTM -> LSTM -> Dense Softmax
- Loss: categoricalCrossentropy
- Optimizer: Adam
- Batch Size: 32
- Top-k-Auswertung für k = 1, 5, 10, 20, 100
- Perplexity-Berechnung
- Interaktion: Vorhersage, Weiter, Auto, Stopp, Reset

## Hinweis

Für größere Datensätze ist Browser-Training langsam. Für die Abgabe sollte zuerst mit kleinem Text getestet werden.
