const DEFAULT_TEXT_FALLBACK = `deep learning ist ein teilgebiet der kuenstlichen intelligenz . neuronale netze lernen aus daten .
deep learning ist ein teilgebiet der kuenstlichen intelligenz . daten sind fuer das training entscheidend .
deep learning ist ein teilgebiet der kuenstlichen intelligenz . modelle lernen aus vielen beispielen .
ein language model lernt wahrscheinliche wortfolgen aus einem text .
das modell sagt das naechste wort auf basis der vorherigen woerter voraus .
ein rekurrentes neuronales netz verarbeitet sequenzen .
ein long short term memory netz kann informationen ueber mehrere schritte speichern .
beim training werden die gewichte angepasst .
der softmax output liefert eine wahrscheinlichkeitsverteilung ueber das dictionary .
die cross entropy misst den fehler zwischen zielwort und vorhergesagter verteilung .
mit mehr daten kann ein neuronales netz bessere muster lernen .
bei sehr wenigen daten kann ein modell den trainings text auswendig lernen .`;
const DEFAULT_TEXT_URL = 'default_text.txt';

const state = {
  tokens: [], vocab: [], tokenToId: new Map(), idToToken: [], sequences: [], labels: [],
  trainX: null, trainY: null, testX: [], testY: [], model: null, seqLen: 5,
  lastPredictions: [], lossHistory: [], lossChart: null, autoTimer: null
};

const $ = (id) => document.getElementById(id);
const examplesFixedHeader = document.getElementById('examplesFixedHeader');
const navToggle = document.getElementById('navToggle');
const headerNav = document.getElementById('headerNav');
const navLinks = Array.from(document.querySelectorAll('.nav-link'));
const toTopButton = document.getElementById('toTopButton');
const dsgvoModal = document.getElementById('dsgvoModal');
const dsgvoOpenBtn = document.getElementById('dsgvoOpenBtn');
const dsgvoCloseBtn = document.getElementById('dsgvoCloseBtn');
const dsgvoCloseBtn2 = document.getElementById('dsgvoCloseBtn2');

window.addEventListener('DOMContentLoaded', async () => {
  $('trainingText').value = await loadDefaultText();

  try {
    await tf.ready();
    const backend = typeof tf.getBackend === 'function' ? tf.getBackend() : '';
    $('backend').textContent = `Backend: ${backend || 'nicht verfuegbar'}`;
  } catch {
    $('backend').textContent = 'Backend: nicht verfuegbar';
  }

  setPrepProgress(0, 'Datenvorbereitung');
  setTrainProgress(0, 'Training');
  setupNavigation();
  setupDsgvoModal();
  bindEvents();
});

async function loadDefaultText() {
  try {
    const response = await fetch(DEFAULT_TEXT_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = (await response.text()).trim();
    return text || DEFAULT_TEXT_FALLBACK;
  } catch {
    return DEFAULT_TEXT_FALLBACK;
  }
}

function setPrepProgress(value, label) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const container = $('prepProgress');
  if (!container) return;
  $('prepProgressBar').style.width = `${pct}%`;
  $('prepProgressValue').textContent = `${pct}%`;
  if (label) $('prepProgressLabel').textContent = label;
  container.classList.toggle('is-active', pct > 0 && pct < 100);
}

function setTrainProgress(value, label) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const container = $('trainProgress');
  if (!container) return;
  $('trainProgressBar').style.width = `${pct}%`;
  $('trainProgressValue').textContent = `${pct}%`;
  if (label) $('trainProgressLabel').textContent = label;
  container.classList.toggle('is-active', pct > 0 && pct < 100);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function bindEvents() {
  $('prepareBtn').addEventListener('click', prepareData);
  $('trainBtn').addEventListener('click', trainModel);
  $('predictBtn').addEventListener('click', predictFromPrompt);
  $('nextBtn').addEventListener('click', acceptBestWord);
  $('autoBtn').addEventListener('click', autoGenerate);
  $('stopBtn').addEventListener('click', stopAuto);
  $('resetBtn').addEventListener('click', resetAll);
}

function syncFixedHeaderOffset() {
  if (!examplesFixedHeader) {
    document.body.style.setProperty('--examples-header-height', '0px');
    return;
  }

  const headerHeight = examplesFixedHeader.getBoundingClientRect().height;
  document.body.style.setProperty('--examples-header-height', `${Math.ceil(headerHeight + 16)}px`);
}

function setMobileNavigationState(isOpen) {
  if (!navToggle || !headerNav) {
    return;
  }

  const shouldOpen = Boolean(isOpen);
  navToggle.setAttribute('aria-expanded', String(shouldOpen));
  navToggle.setAttribute('aria-label', shouldOpen ? 'Navigation schließen' : 'Navigation öffnen');
  headerNav.classList.toggle('is-open', shouldOpen);
  syncFixedHeaderOffset();
}

function scrollToSection(targetId) {
  const targetElement = document.getElementById(targetId);
  if (!targetElement) {
    return;
  }

  const headerHeight = examplesFixedHeader?.getBoundingClientRect().height || 0;
  const targetTop = targetElement.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
  window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
}

function updateScrollControls() {
  if (toTopButton) {
    toTopButton.classList.toggle('is-visible', window.scrollY > 180);
  }
}

function setupNavigation() {
  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = event.currentTarget.getAttribute('href');
      if (!href || !href.startsWith('#')) {
        return;
      }

      event.preventDefault();
      scrollToSection(href.slice(1));
      setMobileNavigationState(false);
    });
  });

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      setMobileNavigationState(!isExpanded);
    });
  }

  if (toTopButton) {
    toTopButton.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  document.addEventListener('click', (event) => {
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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMobileNavigationState(false);
      if (dsgvoModal && !dsgvoModal.hidden) {
        dsgvoModal.hidden = true;
        document.body.style.overflow = '';
      }
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 760) {
      setMobileNavigationState(false);
    }
    syncFixedHeaderOffset();
  });

  window.addEventListener('scroll', updateScrollControls, { passive: true });

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
    document.body.style.overflow = '';
  };

  const openModal = () => {
    dsgvoModal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  dsgvoOpenBtn.addEventListener('click', openModal);
  dsgvoCloseBtn?.addEventListener('click', closeModal);
  dsgvoCloseBtn2?.addEventListener('click', closeModal);

  dsgvoModal.addEventListener('click', (event) => {
    if (event.target === dsgvoModal) {
      closeModal();
    }
  });
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[„“”"()\[\]{}]/g, ' ')
    .replace(/([.,!?;:])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

async function prepareData() {
  disposeDataTensors();
  const prepStartMs = performance.now();
  const updatePrep = (value, label) => {
    let nextLabel = label;
    if (value > 1 && value < 100) {
      const elapsedMs = performance.now() - prepStartMs;
      const remainingMs = Math.max(0, (elapsedMs / value) * (100 - value));
      nextLabel = `${label} - ca. ${formatDuration(remainingMs)} verbleibend`;
    }
    setPrepProgress(value, nextLabel);
  };

  updatePrep(2, 'Eingabe wird geprueft');
  await tf.nextFrame();

  state.seqLen = Number($('seqLen').value);
  const maxVocab = Number($('maxVocab').value);
  const tokens = tokenize($('trainingText').value);

  if (tokens.length < state.seqLen + 10) {
    setPrepProgress(0, 'Datenvorbereitung');
    setWarning('validationMsg', 'Der Trainingskorpus ist zu kurz. Bitte mehr Text einfügen oder Sequenzlänge reduzieren.');
    return;
  }
  setWarning('validationMsg', '');
  updatePrep(6, 'Haeufigkeiten werden ermittelt');
  await tf.nextFrame();

  const frequencies = new Map();
  const frequencyChunk = Math.max(1, Math.floor(tokens.length / 35));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    frequencies.set(token, (frequencies.get(token) || 0) + 1);

    if (i === tokens.length - 1 || i % frequencyChunk === 0) {
      const progress = 6 + ((i + 1) / tokens.length) * 20;
      updatePrep(progress, 'Haeufigkeiten werden ermittelt');
      await tf.nextFrame();
    }
  }

  const special = ['<PAD>', '<UNK>'];
  const vocabWords = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, maxVocab - special.length))
    .map(([word]) => word);

  state.vocab = [...special, ...vocabWords];
  state.idToToken = state.vocab;
  state.tokenToId = new Map(state.vocab.map((word, index) => [word, index]));
  state.tokens = [];
  const tokenMapChunk = Math.max(1, Math.floor(tokens.length / 30));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    state.tokens.push(state.tokenToId.has(token) ? token : '<UNK>');

    if (i === tokens.length - 1 || i % tokenMapChunk === 0) {
      const progress = 28 + ((i + 1) / tokens.length) * 12;
      updatePrep(progress, 'Dictionary wird aufgebaut');
      await tf.nextFrame();
    }
  }

  updatePrep(42, 'Sequenzen werden aufgebaut');
  await tf.nextFrame();

  // Training mit gleicher Padding-Logik wie promptToIds
  const xs = [];
  const ys = [];

  const sequenceCount = Math.max(1, state.tokens.length - 1);
  const sequenceChunk = Math.max(1, Math.floor(sequenceCount / 35));
  for (let i = 0; i < sequenceCount; i++) {
    // Für jeden Position i: nehme die letzten seqLen tokens VOR diesem index als input
    const inputTokens = state.tokens.slice(Math.max(0, i - state.seqLen + 1), i + 1);
    const ids = inputTokens.map(idForToken);
    
    // Padding am Anfang wie in promptToIds
    while (ids.length < state.seqLen) ids.unshift(idForToken('<PAD>'));
    xs.push(ids.slice(-state.seqLen));
    
    // Output: das nächste token
    ys.push(idForToken(state.tokens[i + 1]));

    if (i === sequenceCount - 1 || i % sequenceChunk === 0) {
      const progress = 42 + ((i + 1) / sequenceCount) * 40;
      updatePrep(progress, 'Sequenzen werden aufgebaut');
      await tf.nextFrame();
    }
  }

  updatePrep(84, 'Train/Test Split wird erstellt');
  await tf.nextFrame();

  const split = Math.max(1, Math.floor(xs.length * 0.8));
  const trainXs = xs.slice(0, split);
  const trainYs = ys.slice(0, split);
  state.testX = xs.slice(split);
  state.testY = ys.slice(split);
  state.sequences = xs;
  state.labels = ys;
  updatePrep(88, 'Tensoren werden erstellt');
  await tf.nextFrame();

  state.trainX = tf.tensor2d(trainXs, [trainXs.length, state.seqLen], 'int32');
  updatePrep(93, 'Tensoren werden erstellt');
  await tf.nextFrame();

  state.trainY = tf.oneHot(tf.tensor1d(trainYs, 'int32'), state.vocab.length);
  updatePrep(97, 'Modell wird initialisiert');
  await tf.nextFrame();

  buildModel();
  $('trainBtn').disabled = false;
  $('predictBtn').disabled = true;
  $('nextBtn').disabled = true;
  $('autoBtn').disabled = true;
  setTrainProgress(0, 'Training');
  setPrepProgress(100, 'Daten vorbereitet');
  $('dataInfo').textContent = `${tokens.length} Tokens, ${state.vocab.length} Dictionary-Einträge, ${trainXs.length} Trainingssequenzen, ${state.testX.length} Testsequenzen.`;
  $('modelStatus').textContent = 'Status: Daten vorbereitet, Modell untrainiert';
}

function idForToken(token) { return state.tokenToId.get(token) ?? state.tokenToId.get('<UNK>'); }

function buildModel() {
  if (state.model) state.model.dispose();
  const units = Number($('lstmUnits').value);
  const embeddingDim = Number($('embeddingDim').value);
  const learningRate = Number($('learningRate').value);

  const model = tf.sequential();
  model.add(tf.layers.embedding({ inputDim: state.vocab.length, outputDim: embeddingDim, inputLength: state.seqLen }));
  model.add(tf.layers.lstm({ units, returnSequences: true }));
  model.add(tf.layers.lstm({ units }));
  model.add(tf.layers.dense({ units: state.vocab.length, activation: 'softmax' }));
  model.compile({ optimizer: tf.train.adam(learningRate), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  state.model = model;
}

async function trainModel() {
  if (!state.model || !state.trainX || !state.trainY) return;
  const epochs = Number($('epochs').value);
  const batchSize = 32;
  const trainStartMs = performance.now();
  setTrainProgress(4, `Training gestartet (0/${epochs}) - Zeit wird berechnet`);
  $('modelStatus').textContent = 'Status: Training läuft';
  setButtonsDuringTraining(true);
  state.lossHistory = [];
  updateLossChart();

  await state.model.fit(state.trainX, state.trainY, {
    epochs,
    batchSize,
    shuffle: true,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        const completedEpochs = epoch + 1;
        const elapsedMs = performance.now() - trainStartMs;
        const avgEpochMs = elapsedMs / completedEpochs;
        const remainingMs = Math.max(0, avgEpochMs * (epochs - completedEpochs));
        state.lossHistory.push({ epoch: epoch + 1, loss: logs.loss, acc: logs.acc ?? logs.accuracy ?? 0 });
        updateLossChart();
        const progress = (completedEpochs / epochs) * 100;
        setTrainProgress(progress, `Training Epoche ${completedEpochs}/${epochs} - ca. ${formatDuration(remainingMs)} verbleibend`);
        $('modelStatus').textContent = `Status: Epoche ${epoch + 1}/${epochs}, Loss ${logs.loss.toFixed(4)}`;
        await tf.nextFrame();
      }
    }
  });

  const metrics = await evaluateTopK([1, 5, 10, 20, 100]);
  renderMetrics(metrics);
  $('modelStatus').textContent = 'Status: trainiert';
  setButtonsDuringTraining(false);
  $('predictBtn').disabled = false;
  $('nextBtn').disabled = false;
  $('autoBtn').disabled = false;
  setTrainProgress(100, 'Training abgeschlossen');
}

function setButtonsDuringTraining(isTraining) {
  for (const id of ['prepareBtn','trainBtn','predictBtn','nextBtn','autoBtn','resetBtn']) $(id).disabled = isTraining;
}

function validatePrompt(prompt) {
  const trimmed = prompt.trim();
  if (!trimmed) return 'Bitte zuerst einen Prompt eingeben.';
  if (/\s{2,}/.test(trimmed)) return 'Bitte nur einzelne Leerzeichen zwischen den Wörtern verwenden.';
  if (/[\t\n\r]/.test(prompt)) return 'Bitte den Prompt nur als Wortfolge mit Leerzeichen eingeben.';
  return '';
}

function promptToIds(prompt) {
  const tokens = tokenize(prompt);
  const ids = tokens.map(idForToken);
  while (ids.length < state.seqLen) ids.unshift(0);
  return ids.slice(-state.seqLen);
}

async function predictFromPrompt() {
  if (!state.model) return [];
  const prompt = $('promptInput').value;
  const msg = validatePrompt(prompt);
  setWarning('validationMsg', msg);
  if (msg) return [];

  const candidates = await predictCandidates(prompt);
  const top = candidates.slice(0, 10);
  state.lastPredictions = top;
  renderPredictions(top);
  return top;
}

async function predictCandidates(prompt) {
  const ids = promptToIds(prompt);
  const input = tf.tensor2d([ids], [1, state.seqLen], 'int32');
  const probsTensor = state.model.predict(input);
  const probs = await probsTensor.data();
  input.dispose();
  probsTensor.dispose();
  return topK(Array.from(probs), state.vocab.length);
}

function topK(values, k) {
  const candidates = values
    .map((prob, id) => ({ id, word: state.idToToken[id], prob }))
    .sort((a, b) => b.prob - a.prob);
  
  // Erst filtern ohne PAD/UNK
  let filtered = candidates.filter(x => x.word !== '<PAD>' && x.word !== '<UNK>');
  
  // Falls zu wenig Kandidaten, auch UNK hinzunehmen
  if (filtered.length < k) {
    filtered = candidates.filter(x => x.word !== '<PAD>');
  }
  
  return filtered.slice(0, k);
}

function renderPredictions(items) {
  const container = $('predictions');
  container.innerHTML = '';
  if (!items.length) {
    container.textContent = 'Keine Vorhersage verfügbar.';
    return;
  }
  const maxProb = items[0].prob || 1;
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'prediction-row';
    row.innerHTML = `
      <strong>${index + 1}</strong>
      <div>
        <button type="button" data-word="${escapeHtml(item.word)}">${escapeHtml(item.word)}</button>
        <div class="probbar"><span style="width:${Math.max(2, (item.prob / maxProb) * 100)}%"></span></div>
      </div>
      <span>${(item.prob * 100).toFixed(2)}%</span>`;
    row.querySelector('button').addEventListener('click', () => appendWord(item.word, true));
    container.appendChild(row);
  });
}

function appendWord(word, repredict) {
  const current = $('promptInput').value.trim();
  $('promptInput').value = current ? `${current} ${word}` : word;
  if (repredict) predictFromPrompt();
}

function selectNextWord(predictions) {
  if (!predictions.length) return null;
  return predictions[0].word;
}

function isSentenceBoundaryToken(token) {
  return token === '.' || token === '!' || token === '?';
}

async function acceptBestWord() {
  const prompt = $('promptInput').value;
  const msg = validatePrompt(prompt);
  setWarning('validationMsg', msg);
  if (msg) return;

  const candidates = await predictCandidates(prompt);
  if (candidates.length) {
    const nextWord = selectNextWord(candidates);
    if (nextWord) appendWord(nextWord, true);
  }
}

async function autoGenerate() {
  $('autoBtn').disabled = true;
  $('stopBtn').disabled = false;
  let count = 0;
  let stoppedAtBoundary = false;
  state.autoTimer = true;
  while (state.autoTimer && count < 10) {
    const prompt = $('promptInput').value;
    const msg = validatePrompt(prompt);
    setWarning('validationMsg', msg);
    if (msg) break;

    const candidates = await predictCandidates(prompt);
    if (!candidates.length) break;
    const nextWord = selectNextWord(candidates);
    if (!nextWord) break;
    appendWord(nextWord, false);
    count++;

    if (isSentenceBoundaryToken(nextWord)) {
      stoppedAtBoundary = true;
      break;
    }

    await sleep(350);
  }

  if (stoppedAtBoundary) {
    setWarning('validationMsg', 'Auto-Generierung am Satzende gestoppt.');
  }

  await predictFromPrompt();
  $('autoBtn').disabled = false;
  $('stopBtn').disabled = true;
  state.autoTimer = null;
}

function stopAuto() { state.autoTimer = null; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function evaluateTopK(ks) {
  if (!state.testX.length) return { note: 'Keine Testdaten vorhanden.' };
  const maxK = Math.min(Math.max(...ks), state.vocab.length);
  const hits = Object.fromEntries(ks.map(k => [k, 0]));
  let totalLoss = 0;

  for (let i = 0; i < state.testX.length; i++) {
    const input = tf.tensor2d([state.testX[i]], [1, state.seqLen], 'int32');
    const output = state.model.predict(input);
    const probs = Array.from(await output.data());
    input.dispose(); output.dispose();

    const target = state.testY[i];
    const sorted = probs.map((p, id) => ({ p, id })).sort((a, b) => b.p - a.p).slice(0, maxK).map(x => x.id);
    for (const k of ks) if (sorted.slice(0, Math.min(k, sorted.length)).includes(target)) hits[k]++;
    totalLoss += -Math.log(Math.max(probs[target], 1e-8));
    await tf.nextFrame();
  }
  const crossEntropy = totalLoss / state.testX.length;
  return { count: state.testX.length, hits, crossEntropy, perplexity: Math.exp(crossEntropy) };
}

function renderMetrics(metrics) {
  if (metrics.note) { $('metrics').textContent = metrics.note; return; }
  const rows = Object.entries(metrics.hits).map(([k, v]) => {
    const pct = (v / metrics.count) * 100;
    return `<div class="metric">Top-${k}: ${v}/${metrics.count} = ${pct.toFixed(1)}%</div>`;
  }).join('');
  $('metrics').innerHTML = `
    ${rows}
    <div class="metric">Cross Entropy: ${metrics.crossEntropy.toFixed(4)}</div>
    <div class="metric">Perplexity: ${metrics.perplexity.toFixed(2)}</div>`;
}

function updateLossChart() {
  const ctx = $('lossChart');
  const labels = state.lossHistory.map(x => x.epoch);
  const data = state.lossHistory.map(x => x.loss);
  if (!state.lossChart) {
    state.lossChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Loss', data }] },
      options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: false } } }
    });
  } else {
    state.lossChart.data.labels = labels;
    state.lossChart.data.datasets[0].data = data;
    state.lossChart.update();
  }
}

function resetAll() {
  stopAuto();
  disposeDataTensors();
  if (state.model) state.model.dispose();
  Object.assign(state, { tokens: [], vocab: [], tokenToId: new Map(), idToToken: [], sequences: [], labels: [],
    trainX: null, trainY: null, testX: [], testY: [], model: null, lastPredictions: [], lossHistory: [] });
  $('promptInput').value = '';
  $('predictions').innerHTML = '';
  $('metrics').textContent = 'Noch keine Resultate.';
  $('dataInfo').textContent = 'Noch keine Daten vorbereitet.';
  $('modelStatus').textContent = 'Status: nicht trainiert';
  setPrepProgress(0, 'Datenvorbereitung');
  setTrainProgress(0, 'Training');
  for (const id of ['trainBtn','predictBtn','nextBtn','autoBtn','stopBtn']) $(id).disabled = true;
  $('prepareBtn').disabled = false;
  if (state.lossChart) { state.lossChart.destroy(); state.lossChart = null; }
  setMobileNavigationState(false);
  updateScrollControls();
}

function disposeDataTensors() {
  if (state.trainX) state.trainX.dispose();
  if (state.trainY) state.trainY.dispose();
  state.trainX = null; state.trainY = null;
}

function setWarning(id, msg) { $(id).textContent = msg || ''; }
function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
