let classifier = null;
let modelReady = false;
let imageReady = false;
let latestResults = [];
let uploadedImageObjectUrl = null;

const imageUpload = document.getElementById("imageUpload");
const previewImage = document.getElementById("previewImage");
const placeholder = document.getElementById("placeholder");
const uploadDropzone = document.getElementById("uploadDropzone");
const userImageEvaluation = document.getElementById("userImageEvaluation");
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
  { title: "Beispiel 1", imagePath: "images/banana.png", alt: "Beispielbild: Bananen" },
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
 * Zeigt oder versteckt den "Nach oben"-Button abhängig von der aktuellen Scrollposition.
 * Der Button wird ab 180 px Scrolltiefe eingeblendet.
 */
function updateScrollControls() {
  if (toTopButton) {
    toTopButton.classList.toggle("is-visible", window.scrollY > 180);
  }
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
 * Registriert alle Event-Listener für die Navigation:
 * Ankerlinks mit sanftem Scrollen, Hamburger-Toggle, "Nach oben"-Button,
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
  updateScrollControls();
}

/**
 * Erstellt alle Beispiel-Karten aus dem HTML-Template anhand von `examplesConfig`.
 * Für jede Karte werden DOM-Referenzen gesammelt, das initiale Bewertungs-UI gesetzt
 * und ein Event-Listener für den Diagramm-Typ-Wechsel registriert.
 * Die Zustands-Objekte werden in `exampleCards` gespeichert.
 */
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

    setConfidenceEvaluation(state.validationEl);

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
 * Passt die CSS-Höhe des Chart-Canvas an die Bildschirmbreite an.
 * Auf Mobilgeräten (≤ 600 px) wird eine kleinere Höhe gesetzt.
 * @param {{ canvas: HTMLCanvasElement | null }} chartCtx - Kontext-Objekt mit Canvas-Referenz
 */
function syncCanvasSize(chartCtx) {
  if (!chartCtx.canvas) {
    return;
  }

  const isMobile = window.matchMedia("(max-width: 600px)").matches;
  chartCtx.canvas.style.height = isMobile ? "260px" : "340px";
}

/**
 * Setzt den Statustext eines Diagramm-Bereichs (z. B. Lade- oder Fehlermeldung).
 * @param {string} message - Der anzuzeigende Text
 * @param {{ statusEl: HTMLElement | null }} chartCtx - Kontext-Objekt mit Status-Element-Referenz
 */
function setChartStatus(message, chartCtx) {
  if (chartCtx.statusEl) {
    chartCtx.statusEl.textContent = message;
  }
}

/**
 * Rendert einfache HTML-Balken als Fallback, wenn Chart.js nicht verfügbar ist.
 * Versteckt das Canvas-Element und befüllt das Fallback-Element mit formatierten Balkenzeilen.
 * @param {Array<{label: string, confidence: number}>} results - Klassifikationsergebnisse
 * @param {{ canvas: HTMLCanvasElement, fallback: HTMLElement }} chartCtx - Chart-Kontext-Objekt
 */
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

/**
 * Einstiegspunkt der Anwendung: Lädt das MobileNet-Modell via ml5,
 * klassifiziert das hochgeladene Bild (falls bereits vorhanden) und
 * startet die Klassifikation aller Beispielkarten.
 * Zeigt passende Statusmeldungen im UI und behandelt Fehler.
 */
async function init() {
  try {
    if (isFileProtocol) {
      const fileProtocolMessage = "Bitte ueber lokalen Server starten (http://localhost), nicht per file://.";
      statusText.textContent = fileProtocolMessage;
      setChartStatus("Kein Chart-Update im file://-Modus.", userChartCtx);

      exampleCards.forEach((card) => {
        card.statusEl.textContent = fileProtocolMessage;
        setChartStatus("Kein Chart-Update im file://-Modus.", card.chartCtx);
        setConfidenceEvaluation(card.validationEl);
      });
      return;
    }

    statusText.textContent = "Modell wird geladen...";
    exampleCards.forEach((card) => {
      card.statusEl.textContent = "Modell wird geladen...";
    });

    classifier = await createClassifier();
    modelReady = true;
    statusText.textContent = imageReady
      ? "Modell geladen. Starte Klassifikation..."
      : "Modell geladen. Bitte Bild auswählen.";

    if (imageReady) {
      await classifyImage();
    }

    for (const card of exampleCards) {
      await classifyExampleCard(card);
    }
  } catch (error) {
    console.error("Fehler beim Laden des Modells:", error);
    const message = error?.message || "Unbekannter Fehler";
    statusText.textContent = `Fehler beim Laden des Modells: ${message}`;
    exampleCards.forEach((card) => {
      card.statusEl.textContent = `Fehler beim Laden des Modells: ${message}`;
      setConfidenceEvaluation(card.validationEl);
    });
  }
}

/**
 * Erstellt und gibt eine vollständig initialisierte ml5-MobileNet-Klassifizierer-Instanz zurück.
 * Unterstützt sowohl Promise-basierte als auch synchrone ml5-Builds und wartet,
 * bis das Modell über `resolvedClassifier.ready` vollständig geladen ist.
 * @returns {Promise<object>} Fertig geladener ml5-ImageClassifier
 * @throws {Error} Wenn ml5 nicht verfügbar ist oder der Classifier nicht initialisiert werden kann
 */
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

/**
 * Führt die Bildklassifikation auf einem gegebenen Bild-Element aus.
 * Versucht zunächst die Promise-basierte API; fällt bei Fehlern automatisch
 * auf die Callback-basierte API zurück (Kompatibilität mit verschiedenen ml5-Versionen).
 * @param {HTMLImageElement} input - Das zu klassifizierende Bildelement
 * @returns {Promise<Array<{label: string, confidence: number}>>} Die Top-K Klassifikationsergebnisse
 */
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

/**
 * Stellt sicher, dass ein Bild vollständig geladen ist, bevor es klassifiziert wird.
 * Gibt ein bereits geladenes Bild sofort zurück. Wartet andernfalls auf das `load`-Event.
 * @param {HTMLImageElement} img - Das zu prüfende Bildelement
 * @returns {Promise<void>}
 * @throws {Error} Wenn das Bild nicht geladen werden kann oder `img` null ist
 */
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

/**
 * Setzt den Zustand des hochgeladenen Benutzerbilds vollständig zurück.
 * Gibt die Object-URL frei, versteckt die Vorschau, leert Ergebnisfelder
 * und setzt das Bewertungs-UI in den neutralen Ausgangszustand.
 */
function resetUploadedImageState() {
  if (uploadedImageObjectUrl) {
    URL.revokeObjectURL(uploadedImageObjectUrl);
    uploadedImageObjectUrl = null;
  }

  imageReady = false;
  labelText.textContent = "-";
  confidenceText.textContent = "-";
  previewImage.hidden = true;
  previewImage.onload = null;
  previewImage.onerror = null;
  previewImage.removeAttribute("src");
  placeholder.hidden = false;
  userImageEvaluation.hidden = true;
  latestResults = [];
  setConfidenceEvaluation(userImageEvaluation);
}

/**
 * Prüft, ob eine Datei ein zulässiges Bildformat hat (JPEG, PNG oder WEBP).
 * Validiert sowohl den MIME-Typ als auch die Dateiendung.
 * @param {File} file - Die zu prüfende Datei
 * @returns {boolean} true, wenn das Format erlaubt ist
 */
function isAllowedImageFile(file) {
  if (!file) {
    return false;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const lowerCaseName = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const hasAllowedExtension = [".jpg", ".jpeg", ".png", ".webp"].some((extension) =>
    lowerCaseName.endsWith(extension)
  );

  return allowedTypes.includes(file.type) || (!file.type && hasAllowedExtension);
}

/**
 * Setzt den visuellen Drag-Zustand der Upload-Dropzone.
 * Entfernt alle Zustands-Klassen und fügt die passende für `nextState` hinzu.
 * @param {'active' | 'invalid' | undefined} nextState - Gewünschter Zustand; undefined = neutral
 */
function setDropzoneState(nextState) {
  if (!uploadDropzone) {
    return;
  }

  uploadDropzone.classList.remove("is-drag-active", "is-drag-invalid");

  if (nextState === "active") {
    uploadDropzone.classList.add("is-drag-active");
  }

  if (nextState === "invalid") {
    uploadDropzone.classList.add("is-drag-invalid");
  }
}

/**
 * Lädt eine ausgewählte Datei als Vorschaubild und startet bei Modellbereitschaft
 * automatisch die Klassifikation. Validiert das Dateiformat und zeigt
 * entsprechende Statusmeldungen. Erstellt eine temporäre Object-URL für das Bild.
 * @param {File | null} file - Die zu ladende Bilddatei oder null zum Zurücksetzen
 */
function loadSelectedImage(file) {
  resetUploadedImageState();

  if (!file) {
    statusText.textContent = modelReady
      ? "Bitte Bild auswählen."
      : "Modell wird geladen...";
    return;
  }

  if (!isAllowedImageFile(file)) {
    statusText.textContent = "Ungültiges Dateiformat. Bitte JPG, PNG oder WEBP verwenden.";
    return;
  }

  try {
    uploadedImageObjectUrl = URL.createObjectURL(file);
  } catch (error) {
    console.error("Fehler beim Erstellen der Bild-URL:", error);
    statusText.textContent = "Fehler beim Laden des Bildes.";
    return;
  }

  previewImage.onload = () => {
    previewImage.hidden = false;
    placeholder.hidden = true;
    imageReady = true;
    statusText.textContent = modelReady
      ? "Bild geladen. Starte Klassifikation..."
      : "Bild geladen. Modell wird noch geladen...";

    if (modelReady) {
      void classifyImage();
    }
  };

  previewImage.onerror = () => {
    console.error("Fehler beim Laden der Bildvorschau.");
    statusText.textContent = "Fehler beim Laden des Bildes.";
    imageReady = false;
  };

  previewImage.src = uploadedImageObjectUrl;
}

/**
 * Extrahiert die erste Datei aus einem Drag-and-Drop-DataTransfer-Objekt.
 * Prüft zuerst `dataTransfer.items` (modernes API), dann `dataTransfer.files` als Fallback.
 * @param {DataTransfer | null} dataTransfer - Das DataTransfer-Objekt des Drop-Events
 * @returns {File | null} Die erste gefundene Datei oder null
 */
function getFirstDroppedFile(dataTransfer) {
  if (!dataTransfer) {
    return null;
  }

  if (dataTransfer.items?.length) {
    for (const item of dataTransfer.items) {
      if (item.kind === "file") {
        return item.getAsFile();
      }
    }
  }

  return dataTransfer.files?.[0] || null;
}

/**
 * Richtet die gesamte Drag-and-Drop- sowie Klick-Funktionalität der Upload-Zone ein.
 * Registriert Event-Listener für dragenter, dragover, dragleave, drop, click und keydown.
 * Verhindert Browser-Standardverhalten (z. B. Datei im Tab öffnen) und
 * zeigt visuelles Feedback zum Drag-Zustand.
 */
function setupUploadDropzone() {
  if (!uploadDropzone || !imageUpload) {
    return;
  }

  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    uploadDropzone.addEventListener(eventName, preventDefaults);
  });

  ["dragenter", "dragover", "drop"].forEach((eventName) => {
    document.addEventListener(eventName, preventDefaults);
  });

  uploadDropzone.addEventListener("dragenter", (event) => {
    const hasFiles = Array.from(event.dataTransfer?.types || []).includes("Files");
    setDropzoneState(hasFiles ? "active" : "invalid");
  });

  uploadDropzone.addEventListener("dragover", (event) => {
    const droppedFile = getFirstDroppedFile(event.dataTransfer);
    const hasFiles = Array.from(event.dataTransfer?.types || []).includes("Files");
    const isValid = droppedFile ? isAllowedImageFile(droppedFile) : hasFiles;

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = isValid ? "copy" : "none";
    }

    setDropzoneState(isValid ? "active" : "invalid");
  });

  uploadDropzone.addEventListener("dragleave", (event) => {
    if (event.relatedTarget instanceof Node && uploadDropzone.contains(event.relatedTarget)) {
      return;
    }

    setDropzoneState();
  });

  uploadDropzone.addEventListener("drop", (event) => {
    const file = getFirstDroppedFile(event.dataTransfer);
    setDropzoneState();

    if (imageUpload) {
      imageUpload.value = "";
    }

    loadSelectedImage(file);
  });

  uploadDropzone.addEventListener("click", () => {
    imageUpload.click();
  });

  uploadDropzone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    imageUpload.click();
  });
}

/**
 * Aktualisiert das Bewertungs-UI-Element basierend auf dem Konfidenzwert der Klassifikation.
 * Zeigt "Richtig klassifiziert" (grün) ab dem eingestellten Schwellwert,
 * "Falsch klassifiziert" (rot) darunter oder einen neutralen Zustand ohne Wert.
 * @param {HTMLElement} validationEl - Das zu aktualisierende Bewertungs-Element
 * @param {number} [confidencePercent] - Konfidenz in Prozent (0–100); fehlt → neutraler Zustand
 */
function setConfidenceEvaluation(validationEl, confidencePercent) {
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

/**
 * Klassifiziert alle Beispielkarten neu, nachdem der Konfidenz-Schwellwert geändert wurde.
 * Aktualisiert außerdem das Bewertungs-UI des Benutzerbildes, falls bereits Ergebnisse vorliegen.
 * Wird nur ausgeführt, wenn Modell und Classifier verfügbar sind.
 */
async function reclassifyAllExamples() {
  if (!modelReady || !classifier) {
    return;
  }

  if (latestResults.length > 0) {
    userImageEvaluation.hidden = false;
    setConfidenceEvaluation(userImageEvaluation, latestResults[0].confidence * 100);
  }

  for (const card of exampleCards) {
    await classifyExampleCard(card);
  }
}

/**
 * Normalisiert ein ml5-Label, das mehrere kommagetrennte Bezeichnungen enthalten kann.
 * Gibt nur die erste Bezeichnung (getrimmt) zurück, um eine lesbare Kurzform zu erhalten.
 * @param {string} label - Das rohe Label aus dem Klassifikationsergebnis
 * @returns {string} Erster Teilbegriff des Labels oder "Unbekannt"
 */
function normalizeLabel(label) {
  if (!label) {
    return "Unbekannt";
  }

  return label.split(",")[0].trim();
}

/**
 * Gibt das Chart.js-Optionsobjekt für den gewählten Diagrammtyp zurück.
 * Konfiguriert Legende, Tooltip, Datenbeschriftungen (ChartDataLabels) und
 * – für Balken- und Radardiagramme – Achsenskalierung mit Prozentangaben.
 * @param {'bar' | 'pie' | 'doughnut' | 'radar' | string} type - Der Diagrammtyp
 * @returns {object} Chart.js-Optionsobjekt
 */
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

/**
 * Rendert oder aktualisiert das Chart.js-Diagramm mit den Klassifikationsergebnissen.
 * Zerstört eine ggf. vorhandene alte Chart-Instanz, bevor eine neue erzeugt wird.
 * Fällt auf `renderFallbackBars` zurück, wenn Chart.js nicht geladen ist oder ein Fehler auftritt.
 * @param {Array<{label: string, confidence: number}>} results - Klassifikationsergebnisse
 * @param {object} chartCtx - Chart-Kontext-Objekt mit canvas, fallback, typeSelect und instance
 */
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
  loadSelectedImage(event.target.files?.[0] || null);
});

imageUpload.addEventListener("click", () => {
  imageUpload.value = "";
});

/**
 * Klassifiziert das aktuell hochgeladene Benutzerbild mit dem geladenen Classifier.
 * Zeigt das beste Ergebnis (Label + Konfidenz) im UI an, aktualisiert die Bewertung
 * und rendert das Ergebnisdiagramm. Behandelt Fehler inklusive file://-Protokoll-Hinweis.
 */
async function classifyImage() {
  try {
    statusText.textContent = "Bild wird klassifiziert...";
    labelText.textContent = "-";
    confidenceText.textContent = "-";

    const results = await classifyInput(previewImage);
    if (!results || results.length === 0) {
      statusText.textContent = "Keine Ergebnisse erhalten.";
      userImageEvaluation.hidden = true;
      setConfidenceEvaluation(userImageEvaluation);
      return;
    }

    const bestResult = results[0];
    const confidencePercent = bestResult.confidence * 100;
    statusText.textContent = "Klassifikation abgeschlossen.";
    labelText.textContent = bestResult.label;
    confidenceText.textContent = `${confidencePercent.toFixed(2)} %`;
    userImageEvaluation.hidden = false;
    setConfidenceEvaluation(userImageEvaluation, confidencePercent);
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

/**
 * Klassifiziert das Bild einer einzelnen Beispielkarte.
 * Wartet auf vollständiges Laden des Bildes, führt die Klassifikation durch und
 * aktualisiert Status, Label, Konfidenz, Bewertungs-UI und Diagramm der Karte.
 * @param {object} card - Zustands-Objekt der Beispielkarte (imageEl, statusEl, labelEl, …)
 */
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
      setConfidenceEvaluation(card.validationEl);
      return;
    }

    const bestResult = results[0];
    const confidencePercent = bestResult.confidence * 100;
    card.statusEl.textContent = "Klassifikation abgeschlossen.";
    card.labelEl.textContent = bestResult.label;
    card.confidenceEl.textContent = `${confidencePercent.toFixed(2)} %`;
    setConfidenceEvaluation(card.validationEl, confidencePercent);
    card.latestResults = results;
    renderChart(results, card.chartCtx);
  } catch (error) {
    console.error("Fehler bei der Beispiel-Klassifikation:", error);
    const message = error?.message || "Unbekannter Fehler";
    if (String(message).toLowerCase().includes("insecure")) {
      card.statusEl.textContent = "Fehler bei der Klassifikation: Bitte ueber http://localhost starten (nicht file://).";
      setConfidenceEvaluation(card.validationEl);
      return;
    }
    card.statusEl.textContent = `Fehler bei der Klassifikation: ${message}`;
    setConfidenceEvaluation(card.validationEl);
  }
}

buildExampleCards();
setupNavigation();
setupUploadDropzone();
userImageEvaluation.hidden = true;
setConfidenceEvaluation(userImageEvaluation);
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