let classifier = null;
let modelReady = false;
let imageReady = false;
let resultChart = null;
let latestResults = [];

const imageUpload = document.getElementById("imageUpload");
const previewImage = document.getElementById("previewImage");
const placeholder = document.getElementById("placeholder");
const classifyButton = document.getElementById("classifyButton");
const chartTypeSelect = document.getElementById("chartType");
const resultChartCanvas = document.getElementById("resultChart");
const chartFallback = document.getElementById("chartFallback");
const chartStatus = document.getElementById("chartStatus");

const statusText = document.getElementById("status");
const labelText = document.getElementById("label");
const confidenceText = document.getElementById("confidence");

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

if (window.Chart && window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
}

function getSelectedChartType() {
  if (!chartTypeSelect) {
    return "bar";
  }

  return chartTypeSelect.value;
}

function syncCanvasSize() {
  if (!resultChartCanvas) {
    return;
  }

  const isMobile = window.matchMedia("(max-width: 600px)").matches;
  resultChartCanvas.style.height = isMobile ? "260px" : "340px";
}

function setChartStatus(message) {
  if (chartStatus) {
    chartStatus.textContent = message;
  }
}

function renderFallbackBars(results) {
  if (!chartFallback || !resultChartCanvas) {
    return;
  }

  resultChartCanvas.hidden = true;
  chartFallback.hidden = false;

  const items = results
    .map((item, index) => {
      const label = normalizeLabel(item.label);
      const value = Number((item.confidence * 100).toFixed(2));
      const color = chartPalette[index % chartPalette.length];

      return `
        <div class="fallback-row">
          <div class="fallback-topline">
            <span class="fallback-label">${label}</span>
            <span class="fallback-value">${value.toFixed(2)} %</span>
          </div>
          <div class="fallback-track">
            <div class="fallback-bar" style="width: ${Math.min(value, 100)}%; background: ${color};"></div>
          </div>
        </div>
      `;
    })
    .join("");

  chartFallback.innerHTML = items;
}

async function init() {
  try {
    statusText.textContent = "Modell wird geladen...";
    classifier = await ml5.imageClassifier("MobileNet");
    modelReady = true;
    statusText.textContent = "Modell geladen. Bitte Bild auswählen.";
    updateButtonState();
    console.log("Modell erfolgreich geladen:", classifier);
  } catch (error) {
    console.error("Fehler beim Laden des Modells:", error);
    statusText.textContent = "Fehler beim Laden des Modells.";
  }
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

function renderChart(results) {
  if (!resultChartCanvas || !window.Chart) {
    renderFallbackBars(results);
    setChartStatus("Chart.js nicht verfügbar - Fallback-Balken werden angezeigt.");
    return;
  }

  const chartType = getSelectedChartType();
  const labels = results.map((item) => normalizeLabel(item.label));
  const confidences = results.map((item) => Number((item.confidence * 100).toFixed(2)));
  const colors = labels.map((_, index) => chartPalette[index % chartPalette.length]);
  latestResults = results;
  syncCanvasSize();
  resultChartCanvas.hidden = false;

  if (chartFallback) {
    chartFallback.hidden = true;
    chartFallback.innerHTML = "";
  }

  if (resultChart) {
    resultChart.destroy();
  }

  try {
    const ctx = resultChartCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D-Kontext nicht verfuegbar");
    }

    resultChart = new Chart(resultChartCanvas, {
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
    setChartStatus("Diagramm erfolgreich aktualisiert.");
  } catch (error) {
    console.error("Fehler beim Rendern des Diagramms:", error);
    renderFallbackBars(results);
    setChartStatus("Diagramm konnte nicht gerendert werden - Fallback-Balken aktiv.");
  }
}

if (chartTypeSelect) {
  chartTypeSelect.addEventListener("change", () => {
    if (latestResults.length === 0) {
      return;
    }

    renderChart(latestResults);
  });
}

window.addEventListener("resize", () => {
  syncCanvasSize();

  if (resultChart) {
    resultChart.resize();
  }
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

    const results = await classifier.classify(previewImage);
    console.log("Klassifikationsergebnisse:", results);

    if (!results || results.length === 0) {
      statusText.textContent = "Keine Ergebnisse erhalten.";
      return;
    }

    const bestResult = results[0];

    statusText.textContent = "Klassifikation abgeschlossen.";
    labelText.textContent = bestResult.label;
    confidenceText.textContent = `${(bestResult.confidence * 100).toFixed(2)} %`;
    renderChart(results);
  } catch (error) {
    console.error("Fehler bei der Klassifikation:", error);
    statusText.textContent = "Fehler bei der Klassifikation.";
  }
}

init();