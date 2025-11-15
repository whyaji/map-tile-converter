const API_BASE = window.location.origin.startsWith("http")
  ? ""
  : "http://localhost:3000";

const estateListEl = document.getElementById("estateList");
const runEstateInput = document.getElementById("runEstateSearch");
const updateBoundsForm = document.getElementById("updateBoundsForm");
const updateEstateInput = document.getElementById("updateEstateSearch");
const boundsInput = document.getElementById("boundsInput");
const boundsHelper = document.getElementById("boundsHelper");
const createForm = document.getElementById("createEstateForm");
const runForm = document.getElementById("runWorkflowForm");
const refreshButton = document.getElementById("refreshEstates");
const logConsole = document.getElementById("logConsole");
const runButton = document.getElementById("runButton");
const statusChip = document.getElementById("statusChip");
const statusLabel = document.getElementById("statusLabel");
const downloadSearchInput = document.getElementById("downloadSearch");
const downloadOptionsEl = document.getElementById("downloadOptions");
const createHelper = document.getElementById("createHelper");
const runEstateOptionsEl = document.getElementById("runEstateOptions");
const runHelper = document.getElementById("runHelper");

let isWorkflowRunning = false;
let eventSource;
let downloadEntries = [];
let rawEstates = [];
let rawEstateDetails = [];

function setStatus(running) {
  isWorkflowRunning = running;
  statusChip.classList.toggle("running", running);
  statusLabel.textContent = running ? "Running…" : "Idle";
  runButton.disabled = running;
}

async function fetchEstates() {
  refreshButton.disabled = true;
  estateListEl.innerHTML = "<li>Loading…</li>";

  try {
    const response = await fetch(`${API_BASE}/api/raw/estates`);
    if (!response.ok) {
      throw new Error("Failed to fetch estates");
    }
    const data = await response.json();
    renderEstates(data.estates || []);
  } catch (error) {
    console.error(error);
    estateListEl.innerHTML =
      "<li style='color:#f87171'>Unable to load estates.</li>";
  } finally {
    refreshButton.disabled = false;
  }
}

function renderEstateBadges(estate) {
  const badges = [];

  if (estate.normalized) {
    badges.push('<span class="badge success">Normalized</span>');
  } else {
    badges.push('<span class="badge muted">Not normalized</span>');
  }

  if (estate.chunked) {
    badges.push('<span class="badge success">Chunked</span>');
  } else {
    badges.push('<span class="badge muted">Not chunked</span>');
  }

  return badges.join("");
}

function renderEstates(estates) {
  rawEstateDetails = estates;
  rawEstates = estates.map((estate) => estate.name);

  if (!estates.length) {
    estateListEl.innerHTML = "<li>No estates found.</li>";
  } else {
    estateListEl.innerHTML = estates
      .map(
        (estate) => `
        <li>
          <div class="estate-row">
            <span>${estate.name}</span>
            <span class="badge-group">
              ${renderEstateBadges(estate)}
            </span>
          </div>
        </li>
      `
      )
      .join("");
  }

  runEstateOptionsEl.innerHTML = rawEstates
    .map((name) => `<option value="${name}"></option>`)
    .join("");
  updateRunHelper();
  updateBoundsHelper();
}

async function fetchDownloadOptions() {
  try {
    const response = await fetch(`${API_BASE}/api/downloads/list`);
    if (!response.ok) {
      throw new Error("Failed to fetch download list");
    }

    const payload = await response.json();
    downloadEntries = payload.downloads || [];
    downloadOptionsEl.innerHTML = downloadEntries
      .map(
        (entry) =>
          `<option value="${entry.displayName.replace(
            /"/g,
            "&quot;"
          )}"></option>`
      )
      .join("");
  } catch (error) {
    console.error(error);
    createHelper.textContent = "Unable to load download list. Please retry.";
  }
}

function findDownloadEntryByDisplay(value) {
  if (!value) return null;
  return (
    downloadEntries.find(
      (entry) => entry.displayName.toLowerCase() === value.toLowerCase()
    ) || null
  );
}

function updateCreateHelper() {
  const entry = findDownloadEntryByDisplay(downloadSearchInput.value.trim());
  if (entry) {
    createHelper.textContent = `Folder to be created: ${entry.folderName}`;
  } else {
    createHelper.textContent = "Select an estate from the suggestions above.";
  }
}

function normalizeEstateInput(value) {
  return value.replace(/\s+/g, "_").toUpperCase();
}

function updateRunHelper() {
  const value = runEstateInput.value.trim();
  if (!value) {
    runHelper.textContent = "Pick a folder from the RAW directory list above.";
    return;
  }

  const normalized = normalizeEstateInput(value);
  const matched = rawEstates.find(
    (estate) => estate.toUpperCase() === normalized
  );

  if (matched) {
    runHelper.textContent = `Selected: ${matched}`;
  } else {
    runHelper.textContent = "No matching RAW folder. Check spelling.";
  }
}

function updateBoundsHelper() {
  const value = updateEstateInput.value.trim();
  if (!value) {
    boundsHelper.textContent =
      "Example: 111.82935776721,-2.53234170931 : 111.84694332891,-2.51343130788";
    return;
  }

  const normalized = normalizeEstateInput(value);
  const matched = rawEstates.find(
    (estate) => estate.toUpperCase() === normalized
  );

  if (matched) {
    boundsHelper.textContent = `Updating bounds for: ${matched}`;
  } else {
    boundsHelper.textContent =
      "No matching RAW folder. Check spelling or use suggestions.";
  }
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selectedEntry = findDownloadEntryByDisplay(
    downloadSearchInput.value.trim()
  );

  if (!selectedEntry) {
    alert("Please choose an estate from the download list suggestions.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/workflow/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadId: selectedEntry.downloadId }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to create estate");
    }

    alert(
      payload.message ||
        `Estate created: ${
          selectedEntry.folderName || selectedEntry.displayName
        }`
    );
    createForm.reset();
    updateCreateHelper();
    fetchEstates();
  } catch (error) {
    alert(error.message);
  }
});

runForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const userValue = runEstateInput.value.trim();
  if (!userValue) {
    alert("Please select an estate to run.");
    return;
  }

  const normalized = normalizeEstateInput(userValue);
  const estateName =
    rawEstates.find((name) => name.toUpperCase() === normalized) || null;

  if (!estateName) {
    alert("Unable to find that estate in RAW. Please choose from suggestions.");
    return;
  }

  try {
    runButton.disabled = true;
    const response = await fetch(`${API_BASE}/api/workflow/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estateName }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to start workflow");
    }

    alert(payload.message || "Workflow started.");
    setStatus(true);
  } catch (error) {
    alert(error.message);
    runButton.disabled = false;
  }
});

refreshButton.addEventListener("click", fetchEstates);
downloadSearchInput.addEventListener("input", updateCreateHelper);
runEstateInput.addEventListener("input", updateRunHelper);
updateEstateInput.addEventListener("input", updateBoundsHelper);

function connectLogStream() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`${API_BASE}/api/workflow/stream`);
  eventSource.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    appendLog(payload);
  };
  eventSource.onerror = () => {
    appendLog({
      level: "error",
      message: "Log stream disconnected. Reconnecting shortly…",
      timestamp: new Date().toISOString(),
    });
    setTimeout(connectLogStream, 5000);
  };
}

function appendLog(entry) {
  const placeholder = logConsole.firstElementChild;
  if (placeholder?.classList.contains("placeholder")) {
    logConsole.innerHTML = "";
  }

  const line = document.createElement("div");
  line.className = `log-line ${entry.level || "info"}`;
  const time = new Date(entry.timestamp || Date.now()).toLocaleTimeString();
  line.textContent = `[${time}] [${(entry.level || "info").toUpperCase()}] ${
    entry.message
  }`;

  logConsole.appendChild(line);
  logConsole.scrollTop = logConsole.scrollHeight;

  if (entry.level === "success" || entry.message?.includes("Completed")) {
    setStatus(false);
  }
  if (entry.level === "error") {
    setStatus(false);
  }
}

fetchEstates();
fetchDownloadOptions().then(updateCreateHelper);
connectLogStream();

updateBoundsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const estateValue = updateEstateInput.value.trim();
  const boundsValue = boundsInput.value.trim();

  if (!estateValue) {
    alert("Please select an estate to update.");
    return;
  }

  const normalized = normalizeEstateInput(estateValue);
  const estateName =
    rawEstates.find((name) => name.toUpperCase() === normalized) || null;

  if (!estateName) {
    alert("Unable to find that estate in RAW. Please choose from suggestions.");
    return;
  }

  if (!boundsValue) {
    alert("Please provide a bounds string in the requested format.");
    return;
  }

  const button = document.getElementById("updateBoundsButton");
  button.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/workflow/update-bounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estateName, bounds: boundsValue }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to update bounds");
    }

    alert(payload.message || "Bounds updated.");
    boundsInput.value = "";
    updateBoundsHelper();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});
