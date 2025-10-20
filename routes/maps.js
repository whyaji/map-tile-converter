const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const MapGeneratorService = require("../services/MapGeneratorService");

const router = express.Router();

// Get all available map providers
router.get("/providers", (req, res) => {
  const providers = {
    standard: "OpenStreetMap",
    satellite: "ArcGIS World Imagery",
    terrain: "Thunderforest Landscape",
    hybrid: "ArcGIS World Street Map",
  };

  res.json({
    success: true,
    providers,
  });
});

// Generate offline map (single estate)
router.post("/generate", async (req, res) => {
  try {
    const {
      estateId,
      estateName,
      estateAbbr,
      bounds,
      minZoom = 13,
      maxZoom = 22,
      mapType = "satellite",
    } = req.body;

    if (!estateId || !estateName || !estateAbbr || !bounds) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
        required: ["estateId", "estateName", "estateAbbr", "bounds"],
      });
    }

    const result = await MapGeneratorService.generateOfflineMap({
      estateId,
      estateName,
      estateAbbr,
      bounds,
      minZoom,
      maxZoom,
      mapType,
    });

    res.json(result);
  } catch (error) {
    console.error("Error generating offline map:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Generate offline map with chunked download
router.post("/generate-chunked", async (req, res) => {
  try {
    const {
      estateId,
      estateName,
      estateAbbr,
      bounds,
      minZoom = 13,
      maxZoom = 22,
      mapType = "satellite",
      chunkSize = null,
    } = req.body;

    if (!estateId || !estateName || !estateAbbr || !bounds) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
        required: ["estateId", "estateName", "estateAbbr", "bounds"],
      });
    }

    const result = await MapGeneratorService.generateOfflineMapChunked({
      estateId,
      estateName,
      estateAbbr,
      bounds,
      minZoom,
      maxZoom,
      mapType,
      chunkSize,
    });

    res.json(result);
  } catch (error) {
    console.error("Error generating chunked offline map:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get download progress
router.get("/progress/:downloadId", async (req, res) => {
  try {
    const { downloadId } = req.params;

    const progress = await MapGeneratorService.getProgress(downloadId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: "Download not found",
      });
    }

    res.json({
      success: true,
      progress,
    });
  } catch (error) {
    console.error("Error getting progress:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Download chunk
router.get("/download-chunk/:downloadId/:chunkIndex", async (req, res) => {
  try {
    const { downloadId, chunkIndex } = req.params;
    const chunkIndexNum = parseInt(chunkIndex);

    if (isNaN(chunkIndexNum)) {
      return res.status(400).json({
        success: false,
        error: "Invalid chunk index",
      });
    }

    const chunkPath = await MapGeneratorService.getChunkFile(
      downloadId,
      chunkIndexNum
    );

    if (!chunkPath) {
      return res.status(404).json({
        success: false,
        error: "Chunk not found",
      });
    }

    res.download(
      chunkPath,
      `chunk_${chunkIndexNum.toString().padStart(3, "0")}.bin`
    );
  } catch (error) {
    console.error("Error downloading chunk:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Download complete ZIP file
router.get("/download/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "../assets/maps/downloads", filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    res.download(filePath, filename);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create chunks from existing ZIP file
router.post("/create-chunks-from-zip", async (req, res) => {
  try {
    const { zipFilePath, chunkSize = null, estateName = null } = req.body;

    if (!zipFilePath) {
      return res.status(400).json({
        success: false,
        error: "Missing zipFilePath parameter",
      });
    }

    // Check if ZIP file exists
    if (!(await fs.pathExists(zipFilePath))) {
      return res.status(404).json({
        success: false,
        error: "ZIP file not found",
      });
    }

    const result = await MapGeneratorService.createChunksFromExistingZip(
      zipFilePath,
      chunkSize,
      estateName
    );

    res.json({
      success: true,
      downloadId: result.downloadId,
      chunksCount: result.chunkCount,
      totalSize: result.totalSize,
      chunkSize: result.chunkSize,
      chunks: result.chunks.map((chunk) => ({
        index: chunk.index,
        filename: chunk.filename,
        size: chunk.size,
        checksum: chunk.checksum,
        downloadUrl: `/api/maps/download-chunk/${result.downloadId}/${chunk.index}`,
      })),
    });
  } catch (error) {
    console.error("Error creating chunks from ZIP:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Reconstruct ZIP from chunks
router.post("/reconstruct-zip", async (req, res) => {
  try {
    const { downloadId, outputPath } = req.body;

    if (!downloadId || !outputPath) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: downloadId, outputPath",
      });
    }

    const result = await MapGeneratorService.reconstructZipFromChunks(
      downloadId,
      outputPath
    );

    res.json(result);
  } catch (error) {
    console.error("Error reconstructing ZIP:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// List all downloads
router.get("/downloads", async (req, res) => {
  try {
    const downloads = await MapGeneratorService.listDownloads();
    res.json({
      success: true,
      downloads,
    });
  } catch (error) {
    console.error("Error listing downloads:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get download info
router.get("/download-info/:downloadId", async (req, res) => {
  try {
    const { downloadId } = req.params;

    const progress = await MapGeneratorService.getProgress(downloadId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: "Download not found",
      });
    }

    res.json({
      success: true,
      download: progress,
    });
  } catch (error) {
    console.error("Error getting download info:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
