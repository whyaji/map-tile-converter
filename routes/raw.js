const express = require("express");
const path = require("path");
const fs = require("fs-extra");

const { downloadList } = require("../constants/DownloadList.ts");

const router = express.Router();
const RAW_DIR = path.resolve(__dirname, "../raw");
const NORMALIZED_DIR = path.resolve(__dirname, "../normalized");
const CHUNKS_DIR = path.resolve(__dirname, "../assets/maps/chunks");

const downloadMap = new Map();
downloadList.forEach((item) => {
  const folderName = `${item.estateAbbr}_${item.estateName.replace(
    /\s+/g,
    "_"
  )}`;
  downloadMap.set(folderName, item);
});

async function getEstateStatus(folderName) {
  const normalizedPath = path.join(NORMALIZED_DIR, folderName);
  const normalized = await fs.pathExists(normalizedPath);

  const downloadEntry = downloadMap.get(folderName);
  let chunked = false;
  let downloadId = null;

  if (downloadEntry?.downloadId) {
    downloadId = downloadEntry.downloadId;
    const chunkPath = path.join(CHUNKS_DIR, downloadEntry.downloadId);
    chunked = await fs.pathExists(chunkPath);
  }

  return { normalized, chunked, downloadId };
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
      const status = await getEstateStatus(entry);
      estates.push({
        name: entry,
        normalized: status.normalized,
        chunked: status.chunked,
        downloadId: status.downloadId,
      });
    }
  }

  estates.sort((a, b) => a.name.localeCompare(b.name));
  return estates;
}

router.get("/estates", async (req, res) => {
  try {
    const estates = await listRawEstates();
    res.json({ estates });
  } catch (error) {
    console.error("Failed to list raw estates", error);
    res.status(500).json({ error: "Unable to list raw estates." });
  }
});

module.exports = router;
