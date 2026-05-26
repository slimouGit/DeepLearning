/**
 * KONFIGURATION FÜR DAS FFNN REGRESSIONS-EXPERIMENT
 * Zentrale Parameter für Datenerzeugung, Modelltraining und Darstellung
 */
const CONFIG = {
  N: 100,                    // Anzahl der Datenpunkte
  xMin: -2,
  xMax: 2,                   // Wertebereich für x-Koordinaten
  noiseVar: 0.05,            // Varianz des Gaussian Label-Rauschens
  trainFraction: 0.5,        // 50% Trainingsdaten, 50% Testdaten
  learningRate: 0.01,        // Adam Optimizer Lernrate
  batchSize: 32,             // Größe der Mini-Batches beim Training
  cleanEpochs: 500,          // Epochen für saubere Daten (R2)
  bestEpochs: 80,            // Epochen für Best-Fit Modell (R3)
  overfitEpochs: 2500,       // Epochen für Overfitting Modell (R4)
  curvePoints: 250,          // Punkte für Modellkurven-Visualisierung
  qaRuns: 5,                 // Anzahl zufaelliger QA-Tests
  pretrainedModelUrls: {
    clean: "models/clean/model.json",
    best: "models/best/model.json",
    overfit: "models/overfit/model.json"
  }
};

/**
 * SPEICHERADRESSEN für LocalStorage (Dataset) und IndexedDB (Modelle)
 * Ermöglicht Persistenz zwischen Sessions
 */
const STORAGE_KEYS = {
  dataset: "ea2_dataset_v1",
  losses: "ea2_losses_v1",
  modelClean: "indexeddb://ea2_ffnn_clean",
  modelBest: "indexeddb://ea2_ffnn_best",
  modelOverfit: "indexeddb://ea2_ffnn_overfit"
};

/**
 * FARBEN für Visualisierungen in Plotly
 * Konsistente Farbcodierung über alle Diagramme
 */
const COLORS = {
  train: "#0c6d5b",          // Trainingsdaten
  test: "#b24b2a",           // Testdaten
  model: "#16324f",          // Modellvorhersagen
  truth: "#9f8a2f",          // Wahre Funktion (Ground Truth)
  loss: "#1f3b78"            // Loss-Verlauf
};

/**
 * GLOBALER ANWENDUNGSZUSTAND
 * Speichert alle wichtigen Daten während der Laufzeit:
 * - Trainings- und Testdaten
 * - Drei trainierte Modelle (clean, best-fit, overfit)
 * - Loss-Verläufe und MSE-Metriken
 */
let appState = {
  dataSplit: null,           // Trainings-/Testdaten mit Labels
  models: {
    clean: null,             // Modell auf sauberen Daten trainiert
    best: null,              // Modell mit optimalen Epochen auf verrauschten Daten
    overfit: null            // Modell mit zu vielen Epochen (Overfitting)
  },
  losses: {
    clean: [],               // Array mit Loss-Werten pro Epoche
    best: [],
    overfit: []
  },
  mse: {
    clean: { train: null, test: null },   // Mean Squared Error auf Train/Test
    best: { train: null, test: null },
    overfit: { train: null, test: null }
  }
};

/**
 * DOM-ELEMENT REFERENZEN FÜR NAVIGATION
 * Werden verwendet für responsive Hamburger-Menü-Funktionalität
 */
const examplesFixedHeader = document.getElementById("examplesFixedHeader");
const navToggle = document.getElementById("navToggle");
const headerNav = document.getElementById("headerNav");
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const toTopButton = document.getElementById("toTopButton");
const dsgvoModal = document.getElementById("dsgvoModal");
const dsgvoOpenBtn = document.getElementById("dsgvoOpenBtn");
const dsgvoCloseBtn = document.getElementById("dsgvoCloseBtn");
const dsgvoCloseBtn2 = document.getElementById("dsgvoCloseBtn2");

/**
 * GROUND TRUTH FUNKTION
 * Die wahre Funktion, die wir mit dem FFNN approximieren möchten
 * f(x) = 0.5 * (x+0.8) * (x+1.8) * (x-0.2) * (x-0.3) * (x-1.9) + 1
 */
function f(x) {
  return 0.5 * (x + 0.8) * (x + 1.8) * (x - 0.2) * (x - 0.3) * (x - 1.9) + 1;
}

/**
 * UTILITY FUNKTIONEN FÜR DATENVERARBEITUNG
 */

/**
 * Aktualisiert das Statusfeld mit Nachricht
 * @param {string} message - Anzuzeigende Nachricht
 */
function setStatus(message, tone = "info") {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.remove("is-success", "is-error");
    if (tone === "success") {
      statusEl.classList.add("is-success");
    } else if (tone === "error") {
      statusEl.classList.add("is-error");
    }
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function setPipelineProgress(value, label) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const container = document.getElementById("pipelineProgress");
  if (!container) return;

  const bar = document.getElementById("pipelineProgressBar");
  const valueEl = document.getElementById("pipelineProgressValue");
  const labelEl = document.getElementById("pipelineProgressLabel");

  if (bar) bar.style.width = `${pct}%`;
  if (valueEl) valueEl.textContent = `${pct}%`;
  if (labelEl && label) labelEl.textContent = label;
  container.classList.toggle("is-active", pct > 0 && pct < 100);
}

function setControlsDisabled(disabled) {
  const controlIds = ["btnRun2", "btnSaveData", "btnLoadData", "btnSaveModels", "btnLoadModels", "btnTestModels", "btnQaRandom"];
  controlIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.disabled = Boolean(disabled);
  });
}

function setQaSummary(message) {
  const qaEl = document.getElementById("qaSummary");
  if (qaEl) {
    qaEl.textContent = message;
  }
}

function setActionFeedback(message, isError = false) {
  const feedbackEl = document.getElementById("actionFeedback");
  if (!feedbackEl) {
    return;
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const prefix = isError ? "Fehler" : "Erfolg";
  feedbackEl.innerHTML = `<strong>Letzte Aktion (${hh}:${mm}:${ss}):</strong> ${prefix} - ${message}`;
}

function flashMseLines() {
  ["mse_r2", "mse_r3", "mse_r4"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }

    el.classList.remove("is-updated");
    // restart transition reliably on repeated button clicks
    void el.offsetWidth;
    el.classList.add("is-updated");
    setTimeout(() => {
      el.classList.remove("is-updated");
    }, 800);
  });
}

/**
 * NAVIGATION FUNKTIONEN
 * Responsive Hamburger-Menü für mobile Geräte
 */

/**
 * Öffnet oder schließt das mobile Navigationsmenü.
 * Setzt aria-Attribute, toggled die CSS-Klasse und aktualisiert den Header-Offset.
 * @param {boolean} isOpen - true = Navigation öffnen, false = schließen
 */
function setMobileNavigationState(isOpen) {
  if (!navToggle || !headerNav) {
    return;
  }

  const shouldOpen = Boolean(isOpen);
  navToggle.setAttribute("aria-expanded", String(shouldOpen));
  navToggle.setAttribute("aria-label", shouldOpen ? "Navigation schließen" : "Navigation öffnen");
  headerNav.classList.toggle("is-open", shouldOpen);
  syncFixedHeaderOffset();
}

/**
 * Scrollt sanft zu einem Seitenabschnitt anhand seiner Element-ID.
 * Berücksichtigt die Höhe des fixierten Headers, damit der Abschnitt nicht verdeckt wird.
 * @param {string} targetId - Die ID des Ziel-Elements
 */
function scrollToSection(targetId) {
  const targetElement = document.getElementById(targetId);
  if (!targetElement) {
    return;
  }

  const headerHeight = examplesFixedHeader?.getBoundingClientRect().height || 0;
  const targetTop = targetElement.getBoundingClientRect().top + window.scrollY - headerHeight - 16;

  window.scrollTo({
    top: Math.max(targetTop, 0),
    behavior: "smooth"
  });
}

/**
 * Behandelt Klicks auf Navigations-Ankerlinks.
 * Verhindert das Standard-Scrollverhalten und nutzt stattdessen sanftes Scrollen.
 * Schließt außerdem das mobile Menü nach dem Klick.
 * @param {MouseEvent} event - Das auslösende Klick-Event
 */
function handleNavigationLinkClick(event) {
  const href = event.currentTarget.getAttribute("href");
  if (!href || !href.startsWith("#")) {
    return;
  }

  event.preventDefault();
  scrollToSection(href.slice(1));
  setMobileNavigationState(false);
}

/**
 * Zeigt oder versteckt den "Nach oben"-Button abhängig von der aktuellen Scrollposition.
 */
function updateScrollControls() {
  if (toTopButton) {
    toTopButton.classList.toggle("is-visible", window.scrollY > 180);
  }
}

/**
 * Misst die aktuelle Höhe des fixierten Headers und schreibt den Wert
 * als CSS-Custom-Property `--examples-header-height` ins body-Element.
 * Wird aufgerufen nach Resize und nach dem Öffnen/Schließen der Navigation.
 */
function syncFixedHeaderOffset() {
  if (!examplesFixedHeader) {
    document.body.style.setProperty("--examples-header-height", "0px");
    return;
  }

  const headerHeight = examplesFixedHeader.getBoundingClientRect().height;
  const headerGap = 16;
  document.body.style.setProperty("--examples-header-height", `${Math.ceil(headerHeight + headerGap)}px`);
}

/**
 * Registriert alle Event-Listener für die Navigation:
 * Ankerlinks mit sanftem Scrollen, Hamburger-Toggle, 
 * Schließen des Menüs bei Außenklick oder Escape-Taste sowie Resize-Handler.
 */
function setupNavigation() {
  navLinks.forEach((link) => {
    link.addEventListener("click", handleNavigationLinkClick);
  });

  if (navToggle) {
    navToggle.addEventListener("click", () => {
      const isExpanded = navToggle.getAttribute("aria-expanded") === "true";
      setMobileNavigationState(!isExpanded);
    });
  }

  if (toTopButton) {
    toTopButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  document.addEventListener("click", (event) => {
    if (!navToggle || !headerNav || window.innerWidth > 760) {
      return;
    }

    const clickTarget = event.target;
    if (!(clickTarget instanceof Node)) {
      return;
    }

    if (examplesFixedHeader?.contains(clickTarget)) {
      return;
    }

    setMobileNavigationState(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMobileNavigationState(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      setMobileNavigationState(false);
    }
  });

  window.addEventListener("scroll", updateScrollControls, { passive: true });

  setMobileNavigationState(false);
  syncFixedHeaderOffset();
  updateScrollControls();
}

function setupDsgvoModal() {
  if (!dsgvoModal || !dsgvoOpenBtn) {
    return;
  }

  const closeModal = () => {
    dsgvoModal.hidden = true;
    document.body.style.overflow = "";
  };

  const openModal = () => {
    dsgvoModal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  dsgvoOpenBtn.addEventListener("click", openModal);
  dsgvoCloseBtn?.addEventListener("click", closeModal);
  dsgvoCloseBtn2?.addEventListener("click", closeModal);

  dsgvoModal.addEventListener("click", (event) => {
    if (event.target === dsgvoModal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dsgvoModal.hidden) {
      closeModal();
    }
  });
}

function randn() {
  let u = 0;
  let v = 0;
/**
 * FISHER-YATES SHUFFLE Algorithmus
 * Erzeugt zufällige Permutation für Daten-Aufteilung
 * @param {number} size - Anzahl der zu shufflenden Indizes
 * @returns {number[]} Zufällig permutierte Indexliste
 */
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function shuffleIndices(size) {
  const indices = Array.from({ length: size }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i];
/**
 * VALIDIERUNG von numerischen Arrays
 * Prüft auf richtige Länge und gültige numerische Werte
 * @throws {Error} Falls Array ungültig ist
 */
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  return indices;
}

function validateArray(arr, expectedLength, label) {
  if (!Array.isArray(arr) || arr.length !== expectedLength) {
    throw new Error(label + " hat kein gueltiges Format oder falsche Laenge.");
  }
  for (let i = 0; i < arr.length; i += 1) {
    if (typeof arr[i] !== "number" || Number.isNaN(arr[i])) {
      throw new Error(label + " enthaelt ungueltige numerische Werte.");
    }
  }
}

/**
 * DATENERZEUGUNG
 * Erzeugt Trainingsdaten: Punkte der wahren Funktion mit optionalem Rauschen
 * @param {number} N - Anzahl der Datenpunkte
 * @param {number} noiseVar - Varianz des Gaussian Rauschens
 * @returns {Object} {xs, ys, ysNoise, meta}
 */
function createDataSet(N = CONFIG.N, noiseVar = CONFIG.noiseVar) {
  const xs = [];
  const ys = [];
  const ysNoise = [];

  // Erzeuge N zufällige Punkte im Wertebereich [xMin, xMax]
  for (let i = 0; i < N; i += 1) {
    const x = CONFIG.xMin + Math.random() * (CONFIG.xMax - CONFIG.xMin);
    const y = f(x);                                                  // Ground Truth
    xs.push(x);
    ys.push(y);
    ysNoise.push(y + randn() * Math.sqrt(noiseVar));               // Mit Gaussian Rauschen
  }

  return { xs, ys, ysNoise, meta: { N, noiseVar } };
}

/**
 * TRAIN/TEST AUFTEILUNG
 * Teilt Datensatz zufällig in Trainings- und Testdaten auf
 * Wichtig: Keine Daten-Leakage zwischen Train und Test!
 * @param {Object} data - Erzeugter Datensatz mit xs, ys, ysNoise
 * @param {number} trainFraction - Anteil der Trainingsdaten (z.B. 0.5 = 50%)
 * @returns {Object} {train, test, meta} mit aufgeteilten Daten
 */
function splitDataRandom(data, trainFraction = CONFIG.trainFraction) {
  validateArray(data.xs, data.meta.N, "xs");
  validateArray(data.ys, data.meta.N, "ys");
  validateArray(data.ysNoise, data.meta.N, "ysNoise");

  // Erzeuge zufällige Permutation der Indizes
  const indices = shuffleIndices(data.xs.length);
  const trainSize = Math.floor(data.xs.length * trainFraction);
  const trainIdx = indices.slice(0, trainSize);
  const testIdx = indices.slice(trainSize);

  // Helper: Rekonstruiere Subset basierend auf Indizes
  const mapSplit = (idxList) => ({
    x: idxList.map((idx) => data.xs[idx]),
    y: idxList.map((idx) => data.ys[idx]),
    yN: idxList.map((idx) => data.ysNoise[idx])
  });

  return {
    train: mapSplit(trainIdx),
    test: mapSplit(testIdx),
    meta: {
      trainSize,
      testSize: data.xs.length - trainSize,
      noiseVar: data.meta.noiseVar
    }
  };
}

/**
 * MODELL-ARCHITEKTUR
 * Feedforward Neural Network mit 2 Hidden Layers:
 * Input (1) -> Dense(100, ReLU) -> Dense(100, ReLU) -> Dense(1, Linear)
 * @returns {tf.Sequential} Nicht-trainiertes Modell
 */
function createModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 100, activation: "relu", inputShape: [1] }));
  model.add(tf.layers.dense({ units: 100, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1, activation: "linear" }));  // Output ohne Aktivierung für Regression

  // Adam Optimizer mit kleiner Lernrate für Stabilität
  model.compile({
    optimizer: tf.train.adam(CONFIG.learningRate),
    loss: "meanSquaredError"  // MSE ist Standard für Regression
  });
  return model;
}

/**
 * MODELL-TRAINING
 * Trainiert ein Modell mit Gradient Descent Optimization
 * @param {tf.Sequential} model - Zu trainierendes Modell
 * @param {number[]} x - Input-Werte
 * @param {number[]} y - Target-Werte
 * @param {number} epochs - Anzahl der Durchläufe durch den Datensatz
 * @returns {number[]} Loss-Werte pro Epoche für Visualisierung
 */
async function trainModel(model, x, y, epochs, onEpochEnd) {
  const xs = tf.tensor2d(x, [x.length, 1]);
  const ys = tf.tensor2d(y, [y.length, 1]);

  // Trainiere mit Mini-Batches, shuffle aktiv, verbose aus (kein Console-Output)
  const history = await model.fit(xs, ys, {
    epochs,
    batchSize: CONFIG.batchSize,
    shuffle: true,
    verbose: 0,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        if (typeof onEpochEnd === "function") {
          onEpochEnd(epoch + 1, epochs, logs || {});
        }
        await tf.nextFrame();
      }
    }
  });

  // Memory-Cleanup: TensorFlow Objekte freigeben
  xs.dispose();
  ys.dispose();

  return history.history.loss || [];
}

/**
 * MODELL-VORHERSAGEN
 * Generiert glatte Kurve für Visualisierung durch Sampling
 * @param {tf.Sequential} model - Trainiertes Modell
 * @returns {Object} {xs, ys} Koordinaten für Modellkurve
 */
async function predictCurve(model) {
  // Erzeuge äquidistante Punkte im Wertebereich
  const xs = [];
  const step = (CONFIG.xMax - CONFIG.xMin) / (CONFIG.curvePoints - 1);
  for (let i = 0; i < CONFIG.curvePoints; i += 1) {
    xs.push(CONFIG.xMin + i * step);
  }

  // Batch-Vorhersage für alle Punkte
  const xsT = tf.tensor2d(xs, [xs.length, 1]);
/**
 * MSE-BERECHNUNG
 * Berechnet Mean Squared Error auf einem Datensatz (Train oder Test)
 * MSE = (1/n) * Σ(y_true - y_pred)²
 * @param {tf.Sequential} model - Trainiertes Modell
 * @param {number[]} x - Input-Werte
 * @param {number[]} y - True Label-Werte
 * @returns {number} MSE-Wert (niedrig = besser)
 */
  const ysT = model.predict(xsT);
  const ys = Array.from(await ysT.data());

  // Memory-Cleanup
  xsT.dispose();
  ysT.dispose();
  return { xs, ys };
}

async function mseOnData(model, x, y) {
  return tf.tidy(() => {
    const xs = tf.tensor2d(x, [x.length, 1]);
    const ys = tf.tensor2d(y, [y.length, 1]);
    const pred = model.predict(xs);
    const loss = tf.metrics.meanSquaredError(ys, pred).mean();
    return loss.dataSync()[0];
  });
}

/**
 * VISUALISIERUNGS-FUNKTIONEN mit Plotly.js
 */

/**
 * DATENSÄTZE PLOTTEN (R1)
 * Visualisiert Trainings- und Testdaten mit/ohne Rauschen
 */
function plotDataSets(split) {
  const commonLayout = {
    margin: { t: 10, r: 10, b: 45, l: 45 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: { title: "x" },
    yaxis: { title: "y" },
    legend: { orientation: "h", y: -0.2 }
  };

  // R1 Links: Saubere Daten (ohne Rauschen)
  Plotly.newPlot("r1_clean", [
    {
      x: split.train.x,
      y: split.train.y,
      mode: "markers",
      type: "scatter",
      name: "Train clean",
      marker: { color: COLORS.train, size: 7 }
    },
    {
      x: split.test.x,
      y: split.test.y,
      mode: "markers",
      type: "scatter",
      name: "Test clean",
      marker: { color: COLORS.test, size: 7 }
    }
  ], commonLayout, { responsive: true });

  // R1 Rechts: Verrauschte Daten
  Plotly.newPlot("r1_noisy", [
    {
      x: split.train.x,
      y: split.train.yN,
      mode: "markers",
      type: "scatter",
      name: "Train noisy",
      marker: { color: COLORS.train, size: 7 }
    },
    {
      x: split.test.x,
      y: split.test.yN,
      mode: "markers",
      type: "scatter",
      name: "Test noisy",
      marker: { color: COLORS.test, size: 7 }
    }
  ], commonLayout, { responsive: true });
}

/**
 * MODELLVORHERSAGEN PLOTTEN (R2, R3, R4)
 * Zeigt Datenpunkte, Modellkurve und Ground Truth zusammen
 */
function plotPrediction(divId, x, y, curve, label) {
  Plotly.newPlot(divId, [
    {
      x,
      y,
      mode: "markers",
      type: "scatter",
      name: label,
      marker: { color: label.includes("Train") ? COLORS.train : COLORS.test, size: 7 }
    },
    {
      x: curve.xs,
      y: curve.ys,
      mode: "lines",
      type: "scatter",
      name: "Modell",
      line: { color: COLORS.model, width: 3 }
    },
    {
      x: curve.xs,
      y: curve.xs.map((vx) => f(vx)),  // Wahre Funktion
      mode: "lines",
      type: "scatter",
      name: "Ground truth",
      line: { color: COLORS.truth, width: 2, dash: "dot" }
    }
  ], {
    margin: { t: 10, r: 10, b: 45, l: 45 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: { title: "x" },
    yaxis: { title: "y" },
/**
 * LOSS-VERLAUF PLOTTEN
 * Visualisiert MSE pro Trainingsepoche (Konvergenzverhalten)
 */
    legend: { orientation: "h", y: -0.25 }
  }, { responsive: true });
}

function plotLoss(divId, lossHistory) {
  const values = Array.isArray(lossHistory) ? lossHistory : [];
  const epochs = values.map((_, i) => i + 1);
  const hasData = values.length > 0;

  Plotly.newPlot(divId, [
    {
      x: epochs,
      y: values,
      mode: "lines",
      type: "scatter",
      name: "Train Loss",
      line: { color: COLORS.loss, width: 2 }
    }
  ], {
/**
 * MSE-ZEILE SETZEN
 * Aktualisiert HTML-Element mit Train/Test MSE Werte
 */
    margin: { t: 10, r: 10, b: 45, l: 55 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: { title: "Epoche", range: hasData ? undefined : [0, 1] },
    yaxis: { title: "MSE", range: hasData ? undefined : [0, 1] },
    annotations: hasData
      ? []
      : [{
        text: "Keine Loss-Historie vorhanden. Bitte 'Alles neu berechnen' ausfuehren.",
        x: 0.5,
        y: 0.5,
        xref: "paper",
        yref: "paper",
        showarrow: false,
        font: { size: 12, color: "#555555" }
      }]
  }, { responsive: true });
}

function setMseLine(elementId, title, mse) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = "<strong>" + title + "</strong>: "
    + "MSE_train = " + mse.train.toFixed(6)
    + " | MSE_test = " + mse.test.toFixed(6);
}

async function evaluateAllMse(split) {
  appState.mse.clean.train = await mseOnData(appState.models.clean, split.train.x, split.train.y);
  appState.mse.clean.test = await mseOnData(appState.models.clean, split.test.x, split.test.y);
  appState.mse.best.train = await mseOnData(appState.models.best, split.train.x, split.train.yN);
  appState.mse.best.test = await mseOnData(appState.models.best, split.test.x, split.test.yN);
  appState.mse.overfit.train = await mseOnData(appState.models.overfit, split.train.x, split.train.yN);
  appState.mse.overfit.test = await mseOnData(appState.models.overfit, split.test.x, split.test.yN);
}

function renderMseLines() {
  setMseLine("mse_r2", "R2 clean Modell", appState.mse.clean);
  setMseLine("mse_r3", "R3 best-fit Modell", appState.mse.best);
  setMseLine("mse_r4", "R4 overfit Modell", appState.mse.overfit);
  flashMseLines();
}

async function renderPredictions(split) {
  const curveClean = await predictCurve(appState.models.clean);
  const curveBest = await predictCurve(appState.models.best);
  const curveOverfit = await predictCurve(appState.models.overfit);

  plotPrediction("r2_train", split.train.x, split.train.y, curveClean, "Train clean");
  plotPrediction("r2_test", split.test.x, split.test.y, curveClean, "Test clean");

  plotPrediction("r3_train", split.train.x, split.train.yN, curveBest, "Train noisy");
  plotPrediction("r3_test", split.test.x, split.test.yN, curveBest, "Test noisy");

  plotPrediction("r4_train", split.train.x, split.train.yN, curveOverfit, "Train noisy");
  plotPrediction("r4_test", split.test.x, split.test.yN, curveOverfit, "Test noisy");
}

async function trainAllModels(split, onProgress) {
  const totalEpochs = CONFIG.cleanEpochs + CONFIG.bestEpochs + CONFIG.overfitEpochs;
  let completedEpochs = 0;
  const reportStage = (stageLabel) => (currentEpoch, stageTotalEpochs) => {
    const alreadyDone = completedEpochs;
    const absoluteDone = alreadyDone + currentEpoch;
    if (typeof onProgress === "function") {
      onProgress({
        phase: "training",
        stageLabel,
        stageEpoch: currentEpoch,
        stageTotalEpochs,
        absoluteDone,
        totalEpochs
      });
    }
  };

  setStatus("Trainiere clean Modell...");
  appState.models.clean = createModel();
  appState.losses.clean = await trainModel(
    appState.models.clean,
    split.train.x,
    split.train.y,
    CONFIG.cleanEpochs,
    reportStage("Trainiere clean Modell")
  );
  completedEpochs += CONFIG.cleanEpochs;

  setStatus("Trainiere best-fit Modell...");
  appState.models.best = createModel();
  appState.losses.best = await trainModel(
    appState.models.best,
    split.train.x,
    split.train.yN,
    CONFIG.bestEpochs,
    reportStage("Trainiere best-fit Modell")
  );
  completedEpochs += CONFIG.bestEpochs;

  setStatus("Trainiere overfit Modell...");
  appState.models.overfit = createModel();
  appState.losses.overfit = await trainModel(
    appState.models.overfit,
    split.train.x,
    split.train.yN,
    CONFIG.overfitEpochs,
    reportStage("Trainiere overfit Modell")
  );
}

/**
 * RENDERE LOSS-KURVEN
 * Plottet Loss-Verlauf fuer Clean, Best-Fit und Overfit
 */
function renderLossPlots() {
  plotLoss("loss_clean", appState.losses.clean);
  plotLoss("loss_best", appState.losses.best);
  plotLoss("loss_overfit", appState.losses.overfit);
}

function saveLossHistories() {
  localStorage.setItem(STORAGE_KEYS.losses, JSON.stringify(appState.losses));
}

function loadLossHistories() {
  const raw = localStorage.getItem(STORAGE_KEYS.losses);
  if (!raw) {
    return false;
  }

  const parsed = JSON.parse(raw);
  const hasValid = parsed
    && Array.isArray(parsed.clean)
    && Array.isArray(parsed.best)
    && Array.isArray(parsed.overfit);

  if (!hasValid) {
    throw new Error("Gespeicherte Loss-Historie hat ein ungueltiges Format.");
  }

  appState.losses.clean = parsed.clean;
  appState.losses.best = parsed.best;
  appState.losses.overfit = parsed.overfit;
  return true;
}

function saveDataSet() {
  if (!appState.dataSplit) {
    throw new Error("Kein Datensatz im Speicher vorhanden.");
  }
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(appState.dataSplit));
}

function loadDataSet() {
  const raw = localStorage.getItem(STORAGE_KEYS.dataset);
  if (!raw) {
    throw new Error("Kein gespeicherter Datensatz gefunden.");
  }
  const parsed = JSON.parse(raw);
  if (!parsed.train || !parsed.test || !parsed.meta) {
    throw new Error("Gespeicherter Datensatz hat ein ungueltiges Format.");
  }

  validateArray(parsed.train.x, parsed.meta.trainSize, "train.x");
  validateArray(parsed.train.y, parsed.meta.trainSize, "train.y");
  validateArray(parsed.train.yN, parsed.meta.trainSize, "train.yN");
  validateArray(parsed.test.x, parsed.meta.testSize, "test.x");
  validateArray(parsed.test.y, parsed.meta.testSize, "test.y");
  validateArray(parsed.test.yN, parsed.meta.testSize, "test.yN");
  appState.dataSplit = parsed;
}

async function saveModels() {
  if (!appState.models.clean || !appState.models.best || !appState.models.overfit) {
    throw new Error("Es sind noch nicht alle Modelle trainiert.");
  }
  await appState.models.clean.save(STORAGE_KEYS.modelClean);
  await appState.models.best.save(STORAGE_KEYS.modelBest);
  await appState.models.overfit.save(STORAGE_KEYS.modelOverfit);
  saveLossHistories();
}

async function loadModels() {
  appState.models.clean = await tf.loadLayersModel(STORAGE_KEYS.modelClean);
  appState.models.best = await tf.loadLayersModel(STORAGE_KEYS.modelBest);
  appState.models.overfit = await tf.loadLayersModel(STORAGE_KEYS.modelOverfit);
  try {
    loadLossHistories();
  } catch (err) {
    console.warn("Loss-Historie konnte nicht geladen werden:", err.message);
  }
}

async function tryLoadPretrainedModelsFromUrls() {
  const urls = CONFIG.pretrainedModelUrls;
  if (!urls || !urls.clean || !urls.best || !urls.overfit) {
    return false;
  }

  try {
    appState.models.clean = await tf.loadLayersModel(urls.clean);
    appState.models.best = await tf.loadLayersModel(urls.best);
    appState.models.overfit = await tf.loadLayersModel(urls.overfit);
    return true;
  } catch {
    appState.models.clean = null;
    appState.models.best = null;
    appState.models.overfit = null;
    return false;
  }
}

function hasAllModels() {
  return Boolean(appState.models.clean && appState.models.best && appState.models.overfit);
}

async function renderEverythingFromCurrentState() {
  if (!appState.dataSplit || !hasAllModels()) {
    throw new Error("Datensatz oder Modelle fehlen.");
  }

  plotDataSets(appState.dataSplit);
  renderLossPlots();
  await evaluateAllMse(appState.dataSplit);
  await renderPredictions(appState.dataSplit);
  renderMseLines();
}

async function runQaRandomizedTests(runs = CONFIG.qaRuns) {
  if (!hasAllModels()) {
    throw new Error("Modelle fehlen. Bitte trainieren oder laden.");
  }

  const count = Math.max(1, Math.floor(runs));
  const sum = {
    cleanTrain: 0,
    cleanTest: 0,
    bestTrain: 0,
    bestTest: 0,
    overfitTrain: 0,
    overfitTest: 0
  };

  for (let i = 0; i < count; i += 1) {
    const data = createDataSet(CONFIG.N, CONFIG.noiseVar);
    const split = splitDataRandom(data, CONFIG.trainFraction);

    sum.cleanTrain += await mseOnData(appState.models.clean, split.train.x, split.train.y);
    sum.cleanTest += await mseOnData(appState.models.clean, split.test.x, split.test.y);

    sum.bestTrain += await mseOnData(appState.models.best, split.train.x, split.train.yN);
    sum.bestTest += await mseOnData(appState.models.best, split.test.x, split.test.yN);

    sum.overfitTrain += await mseOnData(appState.models.overfit, split.train.x, split.train.yN);
    sum.overfitTest += await mseOnData(appState.models.overfit, split.test.x, split.test.yN);

    await tf.nextFrame();
  }

  const avg = {
    cleanTrain: sum.cleanTrain / count,
    cleanTest: sum.cleanTest / count,
    bestTrain: sum.bestTrain / count,
    bestTest: sum.bestTest / count,
    overfitTrain: sum.overfitTrain / count,
    overfitTest: sum.overfitTest / count
  };

  setQaSummary(
    `QA (${count} Laeufe): clean train/test ${avg.cleanTrain.toFixed(5)} / ${avg.cleanTest.toFixed(5)} | `
    + `best train/test ${avg.bestTrain.toFixed(5)} / ${avg.bestTest.toFixed(5)} | `
    + `overfit train/test ${avg.overfitTrain.toFixed(5)} / ${avg.overfitTest.toFixed(5)}`
  );
}

async function testModelsOnly() {
  if (!appState.dataSplit) {
    throw new Error("Kein Datensatz vorhanden.");
  }
  if (!appState.models.clean || !appState.models.best || !appState.models.overfit) {
    throw new Error("Modelle fehlen. Bitte trainieren oder laden.");
  }
  await evaluateAllMse(appState.dataSplit);
  renderMseLines();
}

function readParamsFromUI() {
  const n = parseInt(document.getElementById("paramN")?.value, 10);
  const noise = parseFloat(document.getElementById("paramNoise")?.value);
  const split = parseFloat(document.getElementById("paramSplit")?.value);
  const cleanEp = parseInt(document.getElementById("paramCleanEpochs")?.value, 10);
  const bestEp = parseInt(document.getElementById("paramBestEpochs")?.value, 10);
  const overfitEp = parseInt(document.getElementById("paramOverfitEpochs")?.value, 10);
  const qaRuns = parseInt(document.getElementById("paramQaRuns")?.value, 10);

  if (!Number.isNaN(n)) CONFIG.N = n;
  if (!Number.isNaN(noise)) CONFIG.noiseVar = noise;
  if (!Number.isNaN(split)) CONFIG.trainFraction = split;
  if (!Number.isNaN(cleanEp)) CONFIG.cleanEpochs = cleanEp;
  if (!Number.isNaN(bestEp)) CONFIG.bestEpochs = bestEp;
  if (!Number.isNaN(overfitEp)) CONFIG.overfitEpochs = overfitEp;
  if (!Number.isNaN(qaRuns)) CONFIG.qaRuns = qaRuns;
}

async function runFullPipeline() {
  readParamsFromUI();
  const startMs = performance.now();
  const updateProgress = (value, label) => {
    let displayLabel = label;
    if (value > 1 && value < 100) {
      const elapsedMs = performance.now() - startMs;
      const remainingMs = Math.max(0, (elapsedMs / value) * (100 - value));
      displayLabel = `${label} - ca. ${formatDuration(remainingMs)} verbleibend`;
    }
    setPipelineProgress(value, displayLabel);
  };

  setControlsDisabled(true);
  updateProgress(2, "Erzeuge Daten und splitte in Train/Test");

  try {
    setStatus("Erzeuge Daten und splitte in Train/Test...");
    const baseData = createDataSet(CONFIG.N, CONFIG.noiseVar);
    appState.dataSplit = splitDataRandom(baseData, CONFIG.trainFraction);
    plotDataSets(appState.dataSplit);
    updateProgress(12, "Datensatz erzeugt");

    await trainAllModels(appState.dataSplit, ({ stageLabel, stageEpoch, stageTotalEpochs, absoluteDone, totalEpochs }) => {
      const trainProgress = (absoluteDone / totalEpochs) * 74;
      const value = 12 + trainProgress;
      updateProgress(value, `${stageLabel} (${stageEpoch}/${stageTotalEpochs})`);
      setStatus(`${stageLabel}... (${stageEpoch}/${stageTotalEpochs})`);
    });

    updateProgress(88, "Erzeuge Loss-Plots");
    renderLossPlots();

    updateProgress(93, "Berechne MSE");
    await evaluateAllMse(appState.dataSplit);

    updateProgress(97, "Erzeuge Vorhersage-Plots");
    await renderPredictions(appState.dataSplit);
    renderMseLines();
    saveLossHistories();

    updateProgress(100, "Pipeline abgeschlossen");
    setQaSummary("QA: noch nicht ausgefuehrt.");
    setStatus("Fertig: R1-R4, Loss-Plots und MSE sind aktualisiert.");
  } finally {
    setControlsDisabled(false);
  }
}

function wireUI() {
  const bindClick = (id, handler) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener("click", handler);
    }
  };

  const runHandler = async () => {
    try {
      await runFullPipeline();
    } catch (err) {
      setStatus("Fehler: " + err.message);
      console.error(err);
    }
  };

  bindClick("btnRun", runHandler);
  bindClick("btnRun2", runHandler);

  const sliderDefs = [
    { id: "paramN",            valId: "paramNVal",            fmt: (v) => String(Math.round(Number(v))) },
    { id: "paramNoise",        valId: "paramNoiseVal",        fmt: (v) => Number(v).toFixed(2) },
    { id: "paramSplit",        valId: "paramSplitVal",        fmt: (v) => Math.round(Number(v) * 100) + "%" },
    { id: "paramOverfitEpochs",valId: "paramOverfitEpochsVal",fmt: (v) => String(Math.round(Number(v))) },
    { id: "paramQaRuns",       valId: "paramQaRunsVal",       fmt: (v) => String(Math.round(Number(v))) }
  ];

  sliderDefs.forEach(({ id, valId, fmt }) => {
    const slider = document.getElementById(id);
    const label  = document.getElementById(valId);
    if (slider && label) {
      slider.addEventListener("input", () => { label.textContent = fmt(slider.value); });
    }
  });

  bindClick("btnSaveData", () => {
    try {
      saveDataSet();
      setStatus("Datensatz wurde in localStorage gespeichert.");
      setActionFeedback("Datensatz gespeichert.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      setActionFeedback(err.message, true);
      console.error(err);
    }
  });

  bindClick("btnLoadData", async () => {
    try {
      loadDataSet();
      plotDataSets(appState.dataSplit);
      if (appState.models.clean && appState.models.best && appState.models.overfit) {
        await evaluateAllMse(appState.dataSplit);
        await renderPredictions(appState.dataSplit);
        renderMseLines();
      }
      setQaSummary("QA: noch nicht ausgefuehrt.");
      setStatus("Datensatz aus localStorage geladen.");
      setActionFeedback("Datensatz geladen.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      setActionFeedback(err.message, true);
      console.error(err);
    }
  });

  bindClick("btnSaveModels", async () => {
    try {
      await saveModels();
      setStatus("Modelle in IndexedDB gespeichert.");
      setActionFeedback("Modelle gespeichert.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      setActionFeedback(err.message, true);
      console.error(err);
    }
  });

  bindClick("btnLoadModels", async () => {
    try {
      await loadModels();
      if (!appState.dataSplit) {
        const baseData = createDataSet(CONFIG.N, CONFIG.noiseVar);
        appState.dataSplit = splitDataRandom(baseData, CONFIG.trainFraction);
      }
      await renderEverythingFromCurrentState();
      setQaSummary("QA: noch nicht ausgefuehrt.");
      setStatus("Modelle aus IndexedDB geladen und ausgewertet.");
      setActionFeedback("Modelle geladen und ausgewertet.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      setActionFeedback(err.message, true);
      console.error(err);
    }
  });

  bindClick("btnTestModels", async () => {
    try {
      await testModelsOnly();
      setStatus("Modelle erfolgreich auf aktuellem Datensatz getestet.");
      setActionFeedback("Modelle getestet, MSE aktualisiert.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      setActionFeedback(err.message, true);
      console.error(err);
    }
  });

  bindClick("btnQaRandom", async () => {
    try {
      readParamsFromUI();
      setStatus(`Starte QA mit ${CONFIG.qaRuns} zufaelligen Testlaeufen...`);
      await runQaRandomizedTests(CONFIG.qaRuns);
      setStatus(`QA abgeschlossen (${CONFIG.qaRuns} zufaellige Testlaeufe).`);
      setActionFeedback(`QA abgeschlossen mit ${CONFIG.qaRuns} Testlaeufen.`);
    } catch (err) {
      setStatus("Fehler: " + err.message);
      setActionFeedback(err.message, true);
      console.error(err);
    }
  });
}

async function bootstrap() {
  wireUI();
  setupNavigation();
  setupDsgvoModal();
  setQaSummary("QA: noch nicht ausgefuehrt.");
  setActionFeedback("Anwendung gestartet.");
  try {
    let datasetLoaded = false;
    try {
      loadDataSet();
      datasetLoaded = true;
    } catch {
      const baseData = createDataSet(CONFIG.N, CONFIG.noiseVar);
      appState.dataSplit = splitDataRandom(baseData, CONFIG.trainFraction);
      saveDataSet();
    }

    let modelsLoaded = await tryLoadPretrainedModelsFromUrls();
    if (!modelsLoaded) {
      try {
        await loadModels();
        modelsLoaded = true;
      } catch {
        modelsLoaded = false;
      }
    }

    if (modelsLoaded && appState.dataSplit) {
      await renderEverythingFromCurrentState();
      setPipelineProgress(100, "Vortrainierte Modelle geladen");
      const statusMessage = datasetLoaded
        ? "Bereit: Datensatz und 3 vortrainierte Modelle wurden geladen."
        : "Bereit: Neuer Datensatz wurde erzeugt und 3 vortrainierte Modelle wurden geladen.";
      setStatus(statusMessage, "success");
      setActionFeedback("Datensatz + 3 Modelle geladen.");
      return;
    }

    await runFullPipeline();
    await saveModels();
    setActionFeedback("Neue Modelle trainiert und gespeichert.");
  } catch (err) {
    setStatus("Fehler bei Initialisierung: " + err.message, "error");
    setActionFeedback(err.message, true);
    console.error(err);
  }
}

window.addEventListener("load", bootstrap);