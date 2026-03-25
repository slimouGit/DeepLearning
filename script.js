let classifier = null;
let modelReady = false;
let imageReady = false;
let latestResults = [];
let latestExampleResults = [];

// User section DOM refs
const imageUpload    = document.getElementById("imageUpload");
const previewImage   = document.getElementById("previewImage");
const placeholder    = document.getElementById("placeholder");
const classifyButton = document.getElementById("classifyButton");
const statusText     = document.getElementById("status");
const labelText      = document.getElementById("label");
const confidenceText = document.getElementById("confidence");

// Example section DOM refs
const exampleImage          = document.getElementById("exampleImage");
const exampleStatusText     = document.getElementById("exampleStatus");
const exampleLabelText      = document.getElementById("exampleLabel");
const exampleConfidenceText = document.getElementById("exampleConfidence");

// Chart context objects – each holds its own Canvas, fallback, status el, type select and chart instance
const userChartCtx = {
  canvas:    document.getElementById("resultChart"),
  fallback:  document.getElementById("chartFallback"),
  statusEl:  document.getElementById("chartStatus"),
  typeSelect: document.getElementById("chartType"),
  instance:  null
};

const exampleChartCtx = {
  canvas:    document.getElementById("exampleChart"),
  fallback:  document.getElementById("exampleChartFallback"),
  statusEl:  document.getElementById("exampleChartStatus"),
  typeSelect: document.getElementById("exampleChartType"),
  instance:  null
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

const TOP_K = 5;
const isFileProtocol = window.location.protocol === "file:";

if (window.Chart && window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
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
      if (exampleStatusText) {
        exampleStatusText.textContent = fileProtocolMessage;
      }
      if (classifyButton) {
        classifyButton.disabled = true;
      }
      setChartStatus("Kein Chart-Update im file://-Modus.", userChartCtx);
      setChartStatus("Kein Chart-Update im file://-Modus.", exampleChartCtx);
      return;
    }

    statusText.textContent = "Modell wird geladen...";
    if (exampleStatusText) {
      exampleStatusText.textContent = "Modell wird geladen...";
    }
    classifier = await ml5.imageClassifier("MobileNet");
    modelReady = true;
    statusText.textContent = "Modell geladen. Bitte Bild auswählen.";
    updateButtonState();
    console.log("Modell erfolgreich geladen:", classifier);
    await classifyExample();
  } catch (error) {
    console.error("Fehler beim Laden des Modells:", error);
    statusText.textContent = "Fehler beim Laden des Modells.";
    if (exampleStatusText) {
      exampleStatusText.textContent = "Fehler beim Laden des Modells.";
    }
  }
}

async function classifyInput(input) {
  const results = await classifier.classify(input);
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

if (exampleChartCtx.typeSelect) {
  exampleChartCtx.typeSelect.addEventListener("change", () => {
    if (latestExampleResults.length === 0) {
      return;
    }

    renderChart(latestExampleResults, exampleChartCtx);
  });
}

window.addEventListener("resize", () => {
  syncCanvasSize(userChartCtx);
  syncCanvasSize(exampleChartCtx);
  if (userChartCtx.instance) userChartCtx.instance.resize();
  if (exampleChartCtx.instance) exampleChartCtx.instance.resize();
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
    console.log("Klassifikationsergebnisse:", results);

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

async function classifyExample() {
  if (!exampleImage) {
    return;
  }

  try {
    exampleStatusText.textContent = "Bild wird klassifiziert...";
    await ensureImageLoaded(exampleImage);
    const results = await classifyInput(exampleImage);
    console.log("Beispiel-Klassifikationsergebnisse:", results);

    if (!results || results.length === 0) {
      exampleStatusText.textContent = "Keine Ergebnisse erhalten.";
      return;
    }

    const bestResult = results[0];
    exampleStatusText.textContent = "Klassifikation abgeschlossen.";
    exampleLabelText.textContent = bestResult.label;
    exampleConfidenceText.textContent = `${(bestResult.confidence * 100).toFixed(2)} %`;
    latestExampleResults = results;
    renderChart(results, exampleChartCtx);
  } catch (error) {
    console.error("Fehler bei der Beispiel-Klassifikation:", error);
    const message = error?.message || "Unbekannter Fehler";
    if (String(message).toLowerCase().includes("insecure")) {
      exampleStatusText.textContent = "Fehler bei der Klassifikation: Bitte ueber http://localhost starten (nicht file://).";
      return;
    }
    exampleStatusText.textContent = `Fehler bei der Klassifikation: ${message}`;
  }
}

init();