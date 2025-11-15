const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const EventEmitter = require("events");

const { runWorkflowForEstate } = require("../scripts/runProgram");
const { downloadList } = require("../constants/DownloadList.ts");

const router = express.Router();
const RAW_DIR = path.resolve(__dirname, "../raw");
const workflowEmitter = new EventEmitter();
const logHistory = [];
let isRunning = false;

function sanitizeEstateName(rawName) {
  if (!rawName || typeof rawName !== "string") {
    return null;
  }

  const trimmed = rawName.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toUpperCase().replace(/\s+/g, "_");
  if (!/^[A-Z0-9_]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function emitLog(level, message) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  logHistory.push(entry);
  if (logHistory.length > 200) {
    logHistory.shift();
  }

  workflowEmitter.emit("log", entry);
}

async function listRawEstates() {
  if (!(await fs.pathExists(RAW_DIR))) {
    return [];
  }

  const entries = await fs.readdir(RAW_DIR);
  const estates = [];

  for (const entry of entries) {
    if (entry === ".DS_Store") continue;

    const fullPath = path.join(RAW_DIR, entry);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      estates.push(entry);
    }
  }

  estates.sort((a, b) => a.localeCompare(b));
  return estates;
}

function buildMetadataTemplate(estate, folderName) {
  return {
    name: estate.estateName,
    estateAbbr: estate.estateAbbr,
    estateId: estate.estateId ?? null,
    mapType: 1,
    bounds: {
      sw_lat: 0,
      sw_lng: 0,
      ne_lat: 0,
      ne_lng: 0,
    },
    minZoom: 14,
    maxZoom: 18,
    path: `map_regions/${folderName}`,
  };
}

function parseBoundsInput(rawBounds) {
  if (!rawBounds || typeof rawBounds !== "string") {
    throw new Error(
      "Bounds input is required. Format: sw_lng, sw_lat : ne_lng, ne_lat"
    );
  }

  const [swPart, nePart] = rawBounds.split(":").map((part) => part.trim());
  if (!swPart || !nePart) {
    throw new Error("Bounds input must contain both SW and NE coordinates.");
  }

  const [swLngStr, swLatStr] = swPart.split(",").map((value) => value.trim());
  const [neLngStr, neLatStr] = nePart.split(",").map((value) => value.trim());

  const sw_lng = Number(swLngStr);
  const sw_lat = Number(swLatStr);
  const ne_lng = Number(neLngStr);
  const ne_lat = Number(neLatStr);

  const coords = [sw_lng, sw_lat, ne_lng, ne_lat];
  if (coords.some((value) => Number.isNaN(value))) {
    throw new Error("Bounds input contains invalid numbers.");
  }

  return { sw_lat, sw_lng, ne_lat, ne_lng };
}

async function runWorkflowWithLogs(estateName) {
  const originalLog = console.log;
  const originalError = console.error;

  const forward =
    (level, fallbackLogger) =>
    (...args) => {
      const message = args
        .map((arg) =>
          typeof arg === "string" ? arg : JSON.stringify(arg, null, 2)
        )
        .join(" ");

      emitLog(level, message);
      fallbackLogger(...args);
    };

  console.log = forward("info", originalLog);
  console.error = forward("error", originalError);

  try {
    await runWorkflowForEstate(estateName);
    emitLog("success", `🎉 Completed workflow for ${estateName}`);
  } catch (error) {
    emitLog(
      "error",
      `❌ Workflow failed for ${estateName}: ${error.message || error}`
    );
    throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

router.get("/estates", async (req, res) => {
  try {
    const estates = await listRawEstates();
    res.json({ estates });
  } catch (error) {
    console.error("Failed to list estates", error);
    res.status(500).json({ error: "Unable to list estates." });
  }
});

router.post("/create", async (req, res) => {
  try {
    const downloadId = req.body?.downloadId;

    if (!downloadId) {
      return res
        .status(400)
        .json({ error: "downloadId is required to create an estate." });
    }

    const estate = downloadList.find(
      (entry) => entry.downloadId === downloadId
    );

    if (!estate) {
      return res.status(404).json({
        error: "Unable to find the requested estate in download list.",
      });
    }

    const folderName = `${estate.estateAbbr}_${estate.estateName.replace(
      /\s+/g,
      "_"
    )}`;
    const estateDir = path.join(RAW_DIR, folderName);

    if (await fs.pathExists(estateDir)) {
      return res
        .status(409)
        .json({ error: `Estate '${folderName}' already exists.` });
    }

    await fs.ensureDir(path.join(estateDir, "map_regions", folderName));

    const metadataPath = path.join(estateDir, "region_metadata.json");
    await fs.writeJson(
      metadataPath,
      buildMetadataTemplate(estate, folderName),
      {
        spaces: 2,
      }
    );

    emitLog("info", `📁 Created estate folder ${folderName}`);

    res.status(201).json({
      message: `Estate '${folderName}' created successfully.`,
      folderName,
    });
  } catch (error) {
    console.error("Failed to create estate", error);
    res
      .status(500)
      .json({ error: "Unable to create estate. See server logs." });
  }
});

router.post("/run", async (req, res) => {
  try {
    const sanitizedName = sanitizeEstateName(req.body?.estateName);
    if (!sanitizedName) {
      return res
        .status(400)
        .json({ error: "Invalid estate name. Use letters, numbers, or '_'." });
    }

    if (isRunning) {
      return res
        .status(409)
        .json({ error: "Another workflow is already running. Please wait." });
    }

    const estates = await listRawEstates();
    if (!estates.includes(sanitizedName)) {
      return res.status(404).json({
        error: `Estate '${sanitizedName}' was not found in the raw directory.`,
      });
    }

    isRunning = true;
    emitLog("info", `🚀 Starting workflow for ${sanitizedName}`);
    res.json({ message: `Workflow started for '${sanitizedName}'.` });

    runWorkflowWithLogs(sanitizedName)
      .catch(() => {
        // Errors already logged inside runWorkflowWithLogs
      })
      .finally(() => {
        isRunning = false;
        emitLog("info", "✅ Workflow slot is now available.");
      });
  } catch (error) {
    console.error("Failed to start workflow", error);
    isRunning = false;
    res
      .status(500)
      .json({ error: "Unable to start workflow. See server logs." });
  }
});

router.post("/update-bounds", async (req, res) => {
  try {
    const sanitizedName = sanitizeEstateName(req.body?.estateName);
    const boundsInput = req.body?.bounds;

    if (!sanitizedName) {
      return res
        .status(400)
        .json({ error: "Invalid estate name. Use letters, numbers, or '_'." });
    }

    const estateDir = path.join(RAW_DIR, sanitizedName);
    const metadataPath = path.join(estateDir, "region_metadata.json");

    if (!(await fs.pathExists(metadataPath))) {
      return res.status(404).json({
        error: `region_metadata.json not found for ${sanitizedName}.`,
      });
    }

    const newBounds = parseBoundsInput(boundsInput);
    const metadata = await fs.readJson(metadataPath);
    metadata.bounds = {
      ...metadata.bounds,
      ...newBounds,
    };

    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    emitLog(
      "info",
      `🗺️ Updated bounds for ${sanitizedName}: SW(${newBounds.sw_lat}, ${newBounds.sw_lng}) NE(${newBounds.ne_lat}, ${newBounds.ne_lng})`
    );

    res.json({
      message: `Bounds updated for '${sanitizedName}'.`,
      bounds: metadata.bounds,
    });
  } catch (error) {
    console.error("Failed to update bounds", error);
    res.status(400).json({
      error: error.message || "Unable to update bounds. See server logs.",
    });
  }
});

router.get("/stream", (req, res) => {
  req.socket?.setKeepAlive?.(true);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const sendEntry = (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
    res.flush?.();
  };

  logHistory.forEach((entry) => sendEntry(entry));

  const listener = (entry) => {
    sendEntry(entry);
  };

  workflowEmitter.on("log", listener);

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
    res.flush?.();
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    workflowEmitter.removeListener("log", listener);
  });
});

module.exports = router;
