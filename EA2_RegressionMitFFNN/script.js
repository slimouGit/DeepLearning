const CONFIG = {
  N: 100,
  xMin: -2,
  xMax: 2,
  noiseVar: 0.05,
  trainFraction: 0.5,
  learningRate: 0.01,
  batchSize: 32,
  cleanEpochs: 500,
  bestEpochs: 180,
  overfitEpochs: 2200,
  curvePoints: 250
};

const STORAGE_KEYS = {
  dataset: "ea2_dataset_v1",
  modelClean: "indexeddb://ea2_ffnn_clean",
  modelBest: "indexeddb://ea2_ffnn_best",
  modelOverfit: "indexeddb://ea2_ffnn_overfit"
};

const COLORS = {
  train: "#0c6d5b",
  test: "#b24b2a",
  model: "#16324f",
  truth: "#9f8a2f",
  loss: "#1f3b78"
};

let appState = {
  dataSplit: null,
  models: {
    clean: null,
    best: null,
    overfit: null
  },
  losses: {
    clean: [],
    best: [],
    overfit: []
  },
  mse: {
    clean: { train: null, test: null },
    best: { train: null, test: null },
    overfit: { train: null, test: null }
  }
};

function f(x) {
  return 0.5 * (x + 0.8) * (x + 1.8) * (x - 0.2) * (x - 0.3) * (x - 1.9) + 1;
}

function setStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function shuffleIndices(size) {
  const indices = Array.from({ length: size }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i];
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

function createDataSet(N = CONFIG.N, noiseVar = CONFIG.noiseVar) {
  const xs = [];
  const ys = [];
  const ysNoise = [];

  for (let i = 0; i < N; i += 1) {
    const x = CONFIG.xMin + Math.random() * (CONFIG.xMax - CONFIG.xMin);
    const y = f(x);
    xs.push(x);
    ys.push(y);
    ysNoise.push(y + randn() * Math.sqrt(noiseVar));
  }

  return { xs, ys, ysNoise, meta: { N, noiseVar } };
}

function splitDataRandom(data, trainFraction = CONFIG.trainFraction) {
  validateArray(data.xs, data.meta.N, "xs");
  validateArray(data.ys, data.meta.N, "ys");
  validateArray(data.ysNoise, data.meta.N, "ysNoise");

  const indices = shuffleIndices(data.xs.length);
  const trainSize = Math.floor(data.xs.length * trainFraction);
  const trainIdx = indices.slice(0, trainSize);
  const testIdx = indices.slice(trainSize);

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

function createModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 100, activation: "relu", inputShape: [1] }));
  model.add(tf.layers.dense({ units: 100, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1, activation: "linear" }));

  model.compile({
    optimizer: tf.train.adam(CONFIG.learningRate),
    loss: "meanSquaredError"
  });
  return model;
}

async function trainModel(model, x, y, epochs) {
  const xs = tf.tensor2d(x, [x.length, 1]);
  const ys = tf.tensor2d(y, [y.length, 1]);

  const history = await model.fit(xs, ys, {
    epochs,
    batchSize: CONFIG.batchSize,
    shuffle: true,
    verbose: 0
  });

  xs.dispose();
  ys.dispose();

  return history.history.loss || [];
}

async function predictCurve(model) {
  const xs = [];
  const step = (CONFIG.xMax - CONFIG.xMin) / (CONFIG.curvePoints - 1);
  for (let i = 0; i < CONFIG.curvePoints; i += 1) {
    xs.push(CONFIG.xMin + i * step);
  }

  const xsT = tf.tensor2d(xs, [xs.length, 1]);
  const ysT = model.predict(xsT);
  const ys = Array.from(await ysT.data());

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

function plotDataSets(split) {
  const commonLayout = {
    margin: { t: 10, r: 10, b: 45, l: 45 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: { title: "x" },
    yaxis: { title: "y" },
    legend: { orientation: "h", y: -0.2 }
  };

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
      y: curve.xs.map((vx) => f(vx)),
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
    legend: { orientation: "h", y: -0.25 }
  }, { responsive: true });
}

function plotLoss(divId, lossHistory) {
  const epochs = lossHistory.map((_, i) => i + 1);
  Plotly.newPlot(divId, [
    {
      x: epochs,
      y: lossHistory,
      mode: "lines",
      type: "scatter",
      name: "Train Loss",
      line: { color: COLORS.loss, width: 2 }
    }
  ], {
    margin: { t: 10, r: 10, b: 45, l: 55 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: { title: "Epoche" },
    yaxis: { title: "MSE" }
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

async function trainAllModels(split) {
  setStatus("Trainiere clean Modell...");
  appState.models.clean = createModel();
  appState.losses.clean = await trainModel(
    appState.models.clean,
    split.train.x,
    split.train.y,
    CONFIG.cleanEpochs
  );

  setStatus("Trainiere best-fit Modell...");
  appState.models.best = createModel();
  appState.losses.best = await trainModel(
    appState.models.best,
    split.train.x,
    split.train.yN,
    CONFIG.bestEpochs
  );

  setStatus("Trainiere overfit Modell...");
  appState.models.overfit = createModel();
  appState.losses.overfit = await trainModel(
    appState.models.overfit,
    split.train.x,
    split.train.yN,
    CONFIG.overfitEpochs
  );
}

function renderLossPlots() {
  plotLoss("loss_clean", appState.losses.clean);
  plotLoss("loss_best", appState.losses.best);
  plotLoss("loss_overfit", appState.losses.overfit);
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
}

async function loadModels() {
  appState.models.clean = await tf.loadLayersModel(STORAGE_KEYS.modelClean);
  appState.models.best = await tf.loadLayersModel(STORAGE_KEYS.modelBest);
  appState.models.overfit = await tf.loadLayersModel(STORAGE_KEYS.modelOverfit);
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

async function runFullPipeline() {
  setStatus("Erzeuge Daten und splitte in Train/Test...");
  const baseData = createDataSet(CONFIG.N, CONFIG.noiseVar);
  appState.dataSplit = splitDataRandom(baseData, CONFIG.trainFraction);
  plotDataSets(appState.dataSplit);

  await trainAllModels(appState.dataSplit);
  renderLossPlots();
  await evaluateAllMse(appState.dataSplit);
  await renderPredictions(appState.dataSplit);
  renderMseLines();
  setStatus("Fertig: R1-R4, Loss-Plots und MSE sind aktualisiert.");
}

function wireUI() {
  document.getElementById("btnRun").addEventListener("click", async () => {
    try {
      await runFullPipeline();
    } catch (err) {
      setStatus("Fehler: " + err.message);
      console.error(err);
    }
  });

  document.getElementById("btnSaveData").addEventListener("click", () => {
    try {
      saveDataSet();
      setStatus("Datensatz wurde in localStorage gespeichert.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      console.error(err);
    }
  });

  document.getElementById("btnLoadData").addEventListener("click", async () => {
    try {
      loadDataSet();
      plotDataSets(appState.dataSplit);
      if (appState.models.clean && appState.models.best && appState.models.overfit) {
        await evaluateAllMse(appState.dataSplit);
        await renderPredictions(appState.dataSplit);
        renderMseLines();
      }
      setStatus("Datensatz aus localStorage geladen.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      console.error(err);
    }
  });

  document.getElementById("btnSaveModels").addEventListener("click", async () => {
    try {
      await saveModels();
      setStatus("Modelle in IndexedDB gespeichert.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      console.error(err);
    }
  });

  document.getElementById("btnLoadModels").addEventListener("click", async () => {
    try {
      await loadModels();
      if (!appState.dataSplit) {
        const baseData = createDataSet(CONFIG.N, CONFIG.noiseVar);
        appState.dataSplit = splitDataRandom(baseData, CONFIG.trainFraction);
      }
      plotDataSets(appState.dataSplit);
      await evaluateAllMse(appState.dataSplit);
      await renderPredictions(appState.dataSplit);
      renderMseLines();
      setStatus("Modelle aus IndexedDB geladen und ausgewertet.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      console.error(err);
    }
  });

  document.getElementById("btnTestModels").addEventListener("click", async () => {
    try {
      await testModelsOnly();
      setStatus("Modelle erfolgreich auf aktuellem Datensatz getestet.");
    } catch (err) {
      setStatus("Fehler: " + err.message);
      console.error(err);
    }
  });
}

async function bootstrap() {
  wireUI();
  try {
    await runFullPipeline();
  } catch (err) {
    setStatus("Fehler bei Initialisierung: " + err.message);
    console.error(err);
  }
}

window.addEventListener("load", bootstrap);