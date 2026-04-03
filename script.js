let classifier = null;
let modelReady = false;
let imageReady = false;
let latestResults = [];

const imageUpload = document.getElementById("imageUpload");
const previewImage = document.getElementById("previewImage");
const placeholder = document.getElementById("placeholder");
const classifyButton = document.getElementById("classifyButton");
const statusText = document.getElementById("status");
const labelText = document.getElementById("label");
const confidenceText = document.getElementById("confidence");
const confidenceThresholdSelect = document.getElementById("confidenceThresholdSelect");
const examplesFixedHeader = document.getElementById("examplesFixedHeader");
const navToggle = document.getElementById("navToggle");
const headerNav = document.getElementById("headerNav");
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const toTopButton = document.getElementById("toTopButton");

const examplesContainer = document.getElementById("examplesContainer");
const exampleTemplate = document.getElementById("exampleCardTemplate");

const userChartCtx = {
  canvas: document.getElementById("resultChart"),
  fallback: document.getElementById("chartFallback"),
  statusEl: document.getElementById("chartStatus"),
  typeSelect: document.getElementById("chartType"),
  instance: null
};

const chartPalette = [
  "#264653",
  "#2a9d8f",
  "#e9c46a",
  "#f4a261",
  "#e76f51",
  "#5e60ce",
  "#4ea8de",
  "#80ed99",
  "#ffafcc",
  "#b8c0ff"
];

const examplesConfig = [
  { title: "Beispiel 1", imagePath: "images/Banana.png", alt: "Beispielbild: Bananen" },
  { title: "Beispiel 2", imagePath: "images/GoldenRedriewer.png", alt: "Beispielbild: GoldenRedriewer" },
  { title: "Beispiel 3", imagePath: "images/Pizza.png", alt: "Beispielbild: Pizza" },
  { title: "Beispiel ", imagePath: "images/Cat.png", alt: "Beispielbild: Katze" },
  { title: "Beispiel ", imagePath: "images/Painting.png", alt: "Beispielbild: Wasserfarben  " },
  { title: "Beispiel ", imagePath: "images/Towel.png", alt: "Beispielbild: Handtuch" }
];

const exampleCards = [];
const TOP_K = 5;
let validConfidenceThreshold = 70;
const isFileProtocol = window.location.protocol === "file:";

if (window.Chart && window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
}

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

function updateScrollControls() {
  if (toTopButton) {
    toTopButton.classList.toggle("is-visible", window.scrollY > 180);
  }
}

function handleNavigationLinkClick(event) {
  const href = event.currentTarget.getAttribute("href");
  if (!href || !href.startsWith("#")) {
    return;
  }

  event.preventDefault();
  scrollToSection(href.slice(1));
  setMobileNavigationState(false);
}

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
  updateScrollControls();
}

function buildExampleCards() {
  if (!examplesContainer || !exampleTemplate) {
    return;
  }

  examplesContainer.innerHTML = "";

  examplesConfig.forEach((item, index) => {
    const fragment = exampleTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".example-card");

    const titleEl = fragment.querySelector(".example-title");
    const imageEl = fragment.querySelector(".example-image");
    const statusEl = fragment.querySelector(".example-status");
    const labelEl = fragment.querySelector(".example-label");
    const confidenceEl = fragment.querySelector(".example-confidence");
    const validationEl = fragment.querySelector(".classification-eval");
    const chartTypeSelect = fragment.querySelector(".example-chart-type");
    const chartStatusEl = fragment.querySelector(".chart-status");
    const chartCanvas = fragment.querySelector(".example-chart");
    const chartFallback = fragment.querySelector(".chart-fallback");

    titleEl.textContent = item.title || `Beispiel ${index + 1}`;
    imageEl.src = item.imagePath;
    imageEl.alt = item.alt || `Beispielbild ${index + 1}`;

    const state = {
      imageEl,
      statusEl,
      labelEl,
      confidenceEl,
      validationEl,
      latestResults: [],
      chartCtx: {
        canvas: chartCanvas,
        fallback: chartFallback,
        statusEl: chartStatusEl,
        typeSelect: chartTypeSelect,
        instance: null
      }
    };

    setExampleValidation(state.validationEl);

    chartTypeSelect.addEventListener("change", () => {
      if (state.latestResults.length === 0) {
        return;
      }
      renderChart(state.latestResults, state.chartCtx);
    });

    examplesContainer.appendChild(card);
    exampleCards.push(state);
  });
}

function syncFixedHeaderOffset() {
  if (!examplesFixedHeader) {
    document.body.style.setProperty("--examples-header-height", "0px");
    return;
  }

  const headerHeight = examplesFixedHeader.getBoundingClientRect().height;
  const headerGap = 16;
  document.body.style.setProperty("--examples-header-height", `${Math.ceil(headerHeight + headerGap)}px`);
}

function syncCanvasSize(chartCtx) {
  if (!chartCtx.canvas) {
    return;
  }

  const isMobile = window.matchMedia("(max-width: 600px)").matches;
  chartCtx.canvas.style.height = isMobile ? "260px" : "340px";
}

function setChartStatus(message, chartCtx) {
  if (chartCtx.statusEl) {
    chartCtx.statusEl.textContent = message;
  }
}

function renderFallbackBars(results, chartCtx) {
  if (!chartCtx.fallback || !chartCtx.canvas) {
    return;
  }

  chartCtx.canvas.hidden = true;
  chartCtx.fallback.hidden = false;

  const items = results
    .map((item, index) => {
      const label = normalizeLabel(item.label);
      const value = Number((item.confidence * 100).toFixed(2));
      const color = chartPalette[index % chartPalette.length];

      return `
        <div class="fallback-row">
          <div class="fallback-topline">
            <span class="fallback-label">${label}</span>
            <span class="fallback-value">${value.toFixed(2)}\u00a0%</span>
          </div>
          <div class="fallback-track">
            <div class="fallback-bar" style="width: ${Math.min(value, 100)}%; background: ${color};"></div>
          </div>
        </div>
      `;
    })
    .join("");

  chartCtx.fallback.innerHTML = items;
}

async function init() {
  try {
    if (isFileProtocol) {
      const fileProtocolMessage = "Bitte ueber lokalen Server starten (http://localhost), nicht per file://.";
      statusText.textContent = fileProtocolMessage;
      classifyButton.disabled = true;
      setChartStatus("Kein Chart-Update im file://-Modus.", userChartCtx);

      exampleCards.forEach((card) => {
        card.statusEl.textContent = fileProtocolMessage;
        setChartStatus("Kein Chart-Update im file://-Modus.", card.chartCtx);
        setExampleValidation(card.validationEl);
      });
      return;
    }

    statusText.textContent = "Modell wird geladen...";
    exampleCards.forEach((card) => {
      card.statusEl.textContent = "Modell wird geladen...";
    });

    classifier = await createClassifier();
    modelReady = true;
    statusText.textContent = "Modell geladen. Bitte Bild auswählen.";
    updateButtonState();

    for (const card of exampleCards) {
      await classifyExampleCard(card);
    }
  } catch (error) {
    console.error("Fehler beim Laden des Modells:", error);
    const message = error?.message || "Unbekannter Fehler";
    statusText.textContent = `Fehler beim Laden des Modells: ${message}`;
    exampleCards.forEach((card) => {
      card.statusEl.textContent = `Fehler beim Laden des Modells: ${message}`;
      setExampleValidation(card.validationEl);
    });
  }
}

async function createClassifier() {
  if (!window.ml5 || typeof ml5.imageClassifier !== "function") {
    throw new Error("ml5 konnte nicht geladen werden (CDN/Netzwerk).");
  }

  const maybeClassifier = ml5.imageClassifier("MobileNet");

  // Some builds return a Promise, others return the classifier object directly.
  const resolvedClassifier =
    maybeClassifier && typeof maybeClassifier.then === "function"
      ? await maybeClassifier
      : maybeClassifier;

  if (!resolvedClassifier || typeof resolvedClassifier !== "object") {
    throw new Error("ImageClassifier konnte nicht initialisiert werden.");
  }

  // ml5 v1 exposes a ready Promise on model instances.
  if (resolvedClassifier.ready && typeof resolvedClassifier.ready.then === "function") {
    await resolvedClassifier.ready;
  }

  if (typeof resolvedClassifier.classify !== "function") {
    throw new Error("ImageClassifier-Instanz ist ungueltig.");
  }

  return resolvedClassifier;
}

async function classifyInput(input) {
  let results = [];

  try {
    const maybePromise = classifier.classify(input, TOP_K);
    if (maybePromise && typeof maybePromise.then === "function") {
      results = await maybePromise;
    }
  } catch (error) {
    console.warn("Promise-basierte Klassifikation fehlgeschlagen, nutze Callback-Fallback:", error);
  }

  if (!Array.isArray(results)) {
    results = await new Promise((resolve, reject) => {
      const callback = (...args) => {
        const first = args[0];
        const second = args[1];

        if (Array.isArray(first)) {
          resolve(first);
          return;
        }

        if (Array.isArray(second)) {
          resolve(second);
          return;
        }

        if (first instanceof Error) {
          reject(first);
          return;
        }

        resolve([]);
      };

      try {
        classifier.classify(input, TOP_K, callback);
      } catch (firstError) {
        try {
          classifier.classify(input, callback);
        } catch (secondError) {
          reject(secondError || firstError);
        }
      }
    });
  }

  if (!results || !Array.isArray(results)) {
    return [];
  }
  return results.slice(0, TOP_K);
}

async function ensureImageLoaded(img) {
  if (!img) {
    throw new Error("Bildelement nicht gefunden.");
  }

  if (img.complete && img.naturalWidth > 0) {
    return;
  }

  await new Promise((resolve, reject) => {
    const onLoad = () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      resolve();
    };

    const onError = () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      reject(new Error("Bild konnte nicht geladen werden."));
    };

    img.addEventListener("load", onLoad, { once: true });
    img.addEventListener("error", onError, { once: true });
  });
}

function updateButtonState() {
  classifyButton.disabled = !(modelReady && imageReady);
}

function setExampleValidation(validationEl, confidencePercent) {
  if (!validationEl) {
    return;
  }

  validationEl.classList.remove("neutral", "correct", "wrong");

  if (typeof confidencePercent !== "number") {
    validationEl.classList.add("neutral");
    validationEl.innerHTML = `
      <div class="eval-head">
        <span class="eval-text">Noch nicht bewertet</span>
        <span class="eval-score">-</span>
      </div>
      <div class="eval-meter">
        <div class="eval-meter-fill" style="width: 0%"></div>
      </div>
    `;
    return;
  }

  const meterWidth = Math.max(0, Math.min(confidencePercent, 100));

  if (confidencePercent >= validConfidenceThreshold) {
    validationEl.classList.add("correct");
    validationEl.innerHTML = `
      <div class="eval-head">
        <span class="eval-text">Richtig klassifiziert</span>
        <span class="eval-score">${confidencePercent.toFixed(2)} %</span>
      </div>
      <div class="eval-meter">
        <div class="eval-meter-fill" style="width: ${meterWidth}%"></div>
      </div>
    `;
  } else {
    validationEl.classList.add("wrong");
    validationEl.innerHTML = `
      <div class="eval-head">
        <span class="eval-text">Falsch klassifiziert</span>
        <span class="eval-score">${confidencePercent.toFixed(2)} %</span>
      </div>
      <div class="eval-meter">
        <div class="eval-meter-fill" style="width: ${meterWidth}%"></div>
      </div>
    `;
  }
}

async function reclassifyAllExamples() {
  if (!modelReady || !classifier) {
    return;
  }

  for (const card of exampleCards) {
    await classifyExampleCard(card);
  }
}

function normalizeLabel(label) {
  if (!label) {
    return "Unbekannt";
  }

  return label.split(",")[0].trim();
}

function getChartOptions(type) {
  const isAxisChart = type === "bar" || type === "radar";

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom"
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${Number(context.raw).toFixed(2)} %`
        }
      },
      datalabels: {
        color: "#0b132b",
        anchor: isAxisChart ? "end" : "center",
        align: isAxisChart ? "end" : "center",
        offset: isAxisChart ? 2 : 0,
        clamp: true,
        font: {
          weight: "bold"
        },
        formatter: (value) => `${Number(value).toFixed(2)} %`
      }
    },
    scales: isAxisChart
      ? {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => `${value} %`
            }
          }
        }
      : undefined
  };
}

function renderChart(results, chartCtx) {
  if (!chartCtx.canvas || !window.Chart) {
    renderFallbackBars(results, chartCtx);
    setChartStatus("Chart.js nicht verfügbar - Fallback-Balken werden angezeigt.", chartCtx);
    return;
  }

  const chartType = chartCtx.typeSelect ? chartCtx.typeSelect.value : "bar";
  const labels = results.map((item) => normalizeLabel(item.label));
  const confidences = results.map((item) => Number((item.confidence * 100).toFixed(2)));
  const colors = labels.map((_, index) => chartPalette[index % chartPalette.length]);

  syncCanvasSize(chartCtx);
  chartCtx.canvas.hidden = false;

  if (chartCtx.fallback) {
    chartCtx.fallback.hidden = true;
    chartCtx.fallback.innerHTML = "";
  }

  if (chartCtx.instance) {
    chartCtx.instance.destroy();
  }

  try {
    const ctx = chartCtx.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D-Kontext nicht verfügbar");
    }

    chartCtx.instance = new Chart(ctx, {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: "Confidence in %",
            data: confidences,
            backgroundColor: colors,
            borderColor: "#1b1b1b",
            borderWidth: chartType === "bar" || chartType === "radar" ? 1 : 0
          }
        ]
      },
      options: getChartOptions(chartType)
    });
    setChartStatus("Diagramm erfolgreich aktualisiert.", chartCtx);
  } catch (error) {
    console.error("Fehler beim Rendern des Diagramms:", error);
    renderFallbackBars(results, chartCtx);
    setChartStatus("Diagramm konnte nicht gerendert werden - Fallback-Balken aktiv.", chartCtx);
  }
}

if (userChartCtx.typeSelect) {
  userChartCtx.typeSelect.addEventListener("change", () => {
    if (latestResults.length === 0) {
      return;
    }
    renderChart(latestResults, userChartCtx);
  });
}

window.addEventListener("resize", () => {
  syncFixedHeaderOffset();
  syncCanvasSize(userChartCtx);
  if (userChartCtx.instance) {
    userChartCtx.instance.resize();
  }

  exampleCards.forEach((card) => {
    syncCanvasSize(card.chartCtx);
    if (card.chartCtx.instance) {
      card.chartCtx.instance.resize();
    }
  });
});

imageUpload.addEventListener("change", (event) => {
  const file = event.target.files[0];

  imageReady = false;
  updateButtonState();

  if (!file) {
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    statusText.textContent = "Ungültiges Dateiformat. Bitte JPG, PNG oder WEBP verwenden.";
    labelText.textContent = "-";
    confidenceText.textContent = "-";
    previewImage.hidden = true;
    placeholder.hidden = false;
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    previewImage.onload = () => {
      previewImage.hidden = false;
      placeholder.hidden = true;
      imageReady = true;
      statusText.textContent = modelReady
        ? "Bild geladen. Klassifikation kann gestartet werden."
        : "Bild geladen. Modell wird noch geladen...";
      updateButtonState();
    };

    previewImage.src = e.target.result;
  };

  reader.onerror = () => {
    console.error("Fehler beim Einlesen der Datei.");
    statusText.textContent = "Fehler beim Laden des Bildes.";
    imageReady = false;
    updateButtonState();
  };

  reader.readAsDataURL(file);
});

classifyButton.addEventListener("click", async () => {
  if (!modelReady || !imageReady) {
    return;
  }

  await classifyImage();
});

async function classifyImage() {
  try {
    statusText.textContent = "Bild wird klassifiziert...";
    labelText.textContent = "-";
    confidenceText.textContent = "-";

    const results = await classifyInput(previewImage);
    if (!results || results.length === 0) {
      statusText.textContent = "Keine Ergebnisse erhalten.";
      return;
    }

    const bestResult = results[0];
    statusText.textContent = "Klassifikation abgeschlossen.";
    labelText.textContent = bestResult.label;
    confidenceText.textContent = `${(bestResult.confidence * 100).toFixed(2)} %`;
    latestResults = results;
    renderChart(results, userChartCtx);
  } catch (error) {
    console.error("Fehler bei der Klassifikation:", error);
    const message = error?.message || "Unbekannter Fehler";
    if (String(message).toLowerCase().includes("insecure")) {
      statusText.textContent = "Fehler bei der Klassifikation: Bitte ueber http://localhost starten (nicht file://).";
      return;
    }
    statusText.textContent = `Fehler bei der Klassifikation: ${message}`;
  }
}

async function classifyExampleCard(card) {
  if (!card?.imageEl) {
    return;
  }

  try {
    card.statusEl.textContent = "Bild wird klassifiziert...";
    await ensureImageLoaded(card.imageEl);
    const results = await classifyInput(card.imageEl);

    if (!results || results.length === 0) {
      card.statusEl.textContent = "Keine Ergebnisse erhalten.";
      setExampleValidation(card.validationEl);
      return;
    }

    const bestResult = results[0];
    const confidencePercent = bestResult.confidence * 100;
    card.statusEl.textContent = "Klassifikation abgeschlossen.";
    card.labelEl.textContent = bestResult.label;
    card.confidenceEl.textContent = `${confidencePercent.toFixed(2)} %`;
    setExampleValidation(card.validationEl, confidencePercent);
    card.latestResults = results;
    renderChart(results, card.chartCtx);
  } catch (error) {
    console.error("Fehler bei der Beispiel-Klassifikation:", error);
    const message = error?.message || "Unbekannter Fehler";
    if (String(message).toLowerCase().includes("insecure")) {
      card.statusEl.textContent = "Fehler bei der Klassifikation: Bitte ueber http://localhost starten (nicht file://).";
      setExampleValidation(card.validationEl);
      return;
    }
    card.statusEl.textContent = `Fehler bei der Klassifikation: ${message}`;
    setExampleValidation(card.validationEl);
  }
}

buildExampleCards();
setupNavigation();
syncFixedHeaderOffset();

if (window.ResizeObserver && examplesFixedHeader) {
  const fixedHeaderObserver = new ResizeObserver(() => {
    syncFixedHeaderOffset();
  });
  fixedHeaderObserver.observe(examplesFixedHeader);
}

if (confidenceThresholdSelect) {
  confidenceThresholdSelect.value = "70";
  validConfidenceThreshold = 70;
  confidenceThresholdSelect.addEventListener("change", async () => {
    const nextValue = Number(confidenceThresholdSelect.value);
    validConfidenceThreshold = Number.isNaN(nextValue) ? 70 : nextValue;
    await reclassifyAllExamples();
  });
}

init();