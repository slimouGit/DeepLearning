let classifier = null;

const imageUpload = document.getElementById("imageUpload");
const previewImage = document.getElementById("previewImage");
const placeholder = document.getElementById("placeholder");

const statusText = document.getElementById("status");
const labelText = document.getElementById("label");
const confidenceText = document.getElementById("confidence");

async function init() {
  try {
    statusText.textContent = "Modell wird geladen...";
    classifier = await ml5.imageClassifier("MobileNet");
    statusText.textContent = "Modell geladen. Bitte Bild auswählen.";
    console.log("Modell erfolgreich geladen:", classifier);
  } catch (error) {
    console.error("Fehler beim Laden des Modells:", error);
    statusText.textContent = "Fehler beim Laden des Modells.";
  }
}

imageUpload.addEventListener("change", (event) => {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    statusText.textContent = "Ungültiges Dateiformat. Bitte JPG, PNG oder WEBP verwenden.";
    labelText.textContent = "-";
    confidenceText.textContent = "-";
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    previewImage.onload = async () => {
      previewImage.hidden = false;
      placeholder.hidden = true;
      await classifyImage();
    };

    previewImage.src = e.target.result;
  };

  reader.onerror = () => {
    console.error("Fehler beim Einlesen der Datei.");
    statusText.textContent = "Fehler beim Laden des Bildes.";
  };

  reader.readAsDataURL(file);
});

async function classifyImage() {
  if (!classifier) {
    statusText.textContent = "Modell ist noch nicht bereit.";
    return;
  }

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