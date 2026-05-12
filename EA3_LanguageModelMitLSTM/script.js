const DEFAULT_TEXT = `deep learning ist ein teilgebiet der künstlichen intelligenz . neuronale netze lernen aus daten .
Ein language model lernt wahrscheinliche wortfolgen aus einem text .
Das modell sagt das nächste wort auf basis der vorherigen wörter voraus .
Ein rekurrentes neuronales netz verarbeitet sequenzen .
Ein long short term memory netz kann informationen über mehrere schritte speichern .
Beim training werden die gewichte angepasst .
Der softmax output liefert eine wahrscheinlichkeitsverteilung über das dictionary .
Die cross entropy misst den fehler zwischen zielwort und vorhergesagter verteilung .
Mit mehr daten kann ein neuronales netz bessere muster lernen .
Bei sehr wenigen daten kann ein modell den trainings text auswendig lernen .`;

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
  $('trainingText').value = DEFAULT_TEXT;
  $('backend').textContent = `Backend: ${tf.getBackend()}`;
  setupNavigation();
  setupDsgvoModal();
  bindEvents();
});

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

function prepareData() {
  disposeDataTensors();
  state.seqLen = Number($('seqLen').value);
  const maxVocab = Number($('maxVocab').value);
  const tokens = tokenize($('trainingText').value);

  if (tokens.length < state.seqLen + 10) {
    setWarning('validationMsg', 'Der Trainingskorpus ist zu kurz. Bitte mehr Text einfügen oder Sequenzlänge reduzieren.');
    return;
  }
  setWarning('validationMsg', '');

  const frequencies = new Map();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);

  const special = ['<PAD>', '<UNK>'];
  const vocabWords = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, maxVocab - special.length))
    .map(([word]) => word);

  state.vocab = [...special, ...vocabWords];
  state.idToToken = state.vocab;
  state.tokenToId = new Map(state.vocab.map((word, index) => [word, index]));
  state.tokens = tokens.map(t => state.tokenToId.has(t) ? t : '<UNK>');

  const xs = [];
  const ys = [];
  for (let i = 0; i < state.tokens.length - state.seqLen; i++) {
    xs.push(state.tokens.slice(i, i + state.seqLen).map(idForToken));
    ys.push(idForToken(state.tokens[i + state.seqLen]));
  }

  const split = Math.max(1, Math.floor(xs.length * 0.8));
  const trainXs = xs.slice(0, split);
  const trainYs = ys.slice(0, split);
  state.testX = xs.slice(split);
  state.testY = ys.slice(split);
  state.sequences = xs;
  state.labels = ys;

  state.trainX = tf.tensor2d(trainXs, [trainXs.length, state.seqLen], 'int32');
  state.trainY = tf.oneHot(tf.tensor1d(trainYs, 'int32'), state.vocab.length);

  buildModel();
  $('trainBtn').disabled = false;
  $('predictBtn').disabled = true;
  $('nextBtn').disabled = true;
  $('autoBtn').disabled = true;
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
        state.lossHistory.push({ epoch: epoch + 1, loss: logs.loss, acc: logs.acc ?? logs.accuracy ?? 0 });
        updateLossChart();
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

  const ids = promptToIds(prompt);
  const input = tf.tensor2d([ids], [1, state.seqLen], 'int32');
  const probsTensor = state.model.predict(input);
  const probs = await probsTensor.data();
  input.dispose();
  probsTensor.dispose();

  const top = topK(Array.from(probs), 10);
  state.lastPredictions = top;
  renderPredictions(top);
  return top;
}

function topK(values, k) {
  return values
    .map((prob, id) => ({ id, word: state.idToToken[id], prob }))
    .filter(x => x.word !== '<PAD>' && x.word !== '<UNK>')
    .sort((a, b) => b.prob - a.prob)
    .slice(0, k);
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

async function acceptBestWord() {
  if (!state.lastPredictions.length) await predictFromPrompt();
  if (state.lastPredictions.length) appendWord(state.lastPredictions[0].word, true);
}

async function autoGenerate() {
  $('autoBtn').disabled = true;
  $('stopBtn').disabled = false;
  let count = 0;
  state.autoTimer = true;
  while (state.autoTimer && count < 10) {
    const predictions = await predictFromPrompt();
    if (!predictions.length) break;
    appendWord(predictions[0].word, false);
    count++;
    await sleep(350);
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
