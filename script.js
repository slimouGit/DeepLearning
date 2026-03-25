let classifier = null;
let modelReady = false;
let imageReady = false;
let resultChart = null;

const imageUpload = document.getElementById("imageUpload");
const previewImage = document.getElementById("previewImage");
const placeholder = document.getElementById("placeholder");
const classifyButton = document.getElementById("classifyButton");
const chartTypeSelect = document.getElementById("chartType");
const resultChartCanvas = document.getElementById("resultChart");

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
    return;
  }

  const chartType = chartTypeSelect.value;
  const labels = results.map((item) => normalizeLabel(item.label));
  const confidences = results.map((item) => Number((item.confidence * 100).toFixed(2)));
  const colors = labels.map((_, index) => chartPalette[index % chartPalette.length]);

  if (resultChart) {
    resultChart.destroy();
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
}

chartTypeSelect.addEventListener("change", () => {
  if (!resultChart) {
    return;
  }

  const currentResults = resultChart.data.labels.map((label, index) => ({
    label,
    confidence: resultChart.data.datasets[0].data[index] / 100
  }));

  renderChart(currentResults);
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