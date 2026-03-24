let classifier = null;
let modelReady = false;
let imageReady = false;

const imageUpload = document.getElementById("imageUpload");
const previewImage = document.getElementById("previewImage");
const placeholder = document.getElementById("placeholder");
const classifyButton = document.getElementById("classifyButton");

const statusText = document.getElementById("status");
const labelText = document.getElementById("label");
const confidenceText = document.getElementById("confidence");

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
  } catch (error) {
    console.error("Fehler bei der Klassifikation:", error);
    statusText.textContent = "Fehler bei der Klassifikation.";
  }
}

init();