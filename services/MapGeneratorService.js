const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const axios = require("axios");
const crypto = require("crypto");

// Import the download list
const { downloadList } = require("../constants/DownloadList.ts");

// Import metadata utilities
const {
  generateStandardizedMetadata,
  saveStandardizedMetadata,
} = require("../scripts/metadataUtils");

// Daftar provider tile map
const MAP_PROVIDERS = {
  standard: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  terrain:
    "https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=your_api_key_here",
  hybrid:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
};

// Fungsi untuk mengkonversi koordinat lat/lng ke tile X,Y
function longitudeToTileX(longitude, zoom) {
  return Math.floor(((longitude + 180.0) / 360.0) * (1 << zoom));
}

function latitudeToTileY(latitude, zoom) {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((latitude * Math.PI) / 180.0) +
          1 / Math.cos((latitude * Math.PI) / 180.0)
      ) /
        Math.PI) /
      2.0) *
      (1 << zoom)
  );
}

// Fungsi untuk menghitung jumlah tile dan estimasi ukuran
function calculateTileCount(bounds, minZoom, maxZoom) {
  let totalTiles = 0;
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const minX = longitudeToTileX(bounds.southwest.longitude, zoom);
    const maxX = longitudeToTileX(bounds.northeast.longitude, zoom);
    const minY = latitudeToTileY(bounds.northeast.latitude, zoom);
    const maxY = latitudeToTileY(bounds.southwest.latitude, zoom);

    totalTiles += (maxX - minX + 1) * (maxY - minY + 1);
  }
  return totalTiles;
}

// Membuat waktu delay dengan Promise
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fungsi untuk format ukuran file
function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

class MapGeneratorService {
  constructor() {
    // Base paths for map storage
    this.basePath = path.resolve(__dirname, "../assets/maps");
    this.downloadsPath = path.resolve(this.basePath, "downloads");
    this.outputPath = path.resolve(this.basePath, "output");
    this.chunksPath = path.resolve(this.basePath, "chunks");
    this.metadataPath = path.resolve(this.basePath, "metadata");

    // Default chunk size: 2MB
    this.defaultChunkSize = 2 * 1024 * 1024; // 2MB per chunk
  }

  /**
   * Find estate data from DownloadList by estate name
   */
  findEstateData(estateName) {
    // Normalize estate name for comparison (remove underscores, convert to uppercase)
    const normalizedEstateName = estateName.replace(/_/g, " ").toUpperCase();

    const estate = downloadList.find(
      (item) => item.estateName.toUpperCase() === normalizedEstateName
    );

    // If not found, try to find by estate abbreviation
    if (!estate) {
      const estateAbbr = estateName.split("_")[0];
      return (
        downloadList.find(
          (item) => item.estateAbbr.toUpperCase() === estateAbbr.toUpperCase()
        ) || null
      );
    }

    return estate;
  }

  /**
   * Generate download ID based on estate name from DownloadList or use random UUID as fallback
   */
  generateDownloadId(estateName = null) {
    if (estateName) {
      console.log(`🔍 Looking for estate: "${estateName}"`);
      const estateData = this.findEstateData(estateName);
      if (estateData && estateData.downloadId) {
        console.log(
          `✅ Found estate data: ${estateData.estateName} (${estateData.estateAbbr}) - Download ID: ${estateData.downloadId}`
        );
        return estateData.downloadId;
      } else {
        console.log(
          `❌ Estate not found in download list, generating random UUID`
        );
      }
    }
    // Fallback to random UUID if no estate name provided or not found in list
    const randomId = crypto.randomUUID();
    console.log(`🆔 Generated random download ID: ${randomId}`);
    return randomId;
  }

  async generateOfflineMap({
    estateId,
    estateName,
    estateAbbr,
    bounds,
    minZoom = 13,
    maxZoom = 22,
    mapType = "satellite",
  }) {
    try {
      // Validate required parameters
      if (!bounds || !estateName || !estateId) {
        throw new Error(
          "Missing required parameters: bounds, estateName, estateId"
        );
      }

      // Create unique ID and formatted name
      const regionId = `estate_${estateId}_${Date.now()}`;
      const formattedName = `${estateAbbr}_${estateName.replace(/\s+/g, "_")}`;

      // Create directories for storing tiles
      const outputDir = path.join(this.outputPath, formattedName);
      const mapRegionsDir = path.join(outputDir, "map_regions", formattedName);

      await fs.ensureDir(outputDir);
      await fs.ensureDir(mapRegionsDir);

      // Log information
      console.log(
        `Starting download for estate ${estateName} (ID: ${estateId})`
      );
      console.log(
        `Bounds: SW(${bounds.southwest.latitude},${bounds.southwest.longitude}), NE(${bounds.northeast.latitude},${bounds.northeast.longitude})`
      );
      console.log(`Zoom levels: ${minZoom}-${maxZoom}, Map type: ${mapType}`);

      // Calculate total tiles
      const totalTiles = calculateTileCount(bounds, minZoom, maxZoom);
      console.log(`Total tiles to download: ${totalTiles}`);

      // Start downloading tiles asynchronously
      let downloadedTiles = 0;
      let failedTiles = 0;

      // Get URL template and set concurrency limit
      const urlTemplate = MAP_PROVIDERS[mapType];
      if (!urlTemplate) {
        throw new Error(
          `Invalid map type: ${mapType}. Available types: ${Object.keys(
            MAP_PROVIDERS
          ).join(", ")}`
        );
      }

      const maxConcurrent = 20; // Limit concurrent downloads

      // Download tiles for each zoom level
      for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
        const zoomDir = path.join(mapRegionsDir, zoom.toString());
        await fs.ensureDir(zoomDir);

        const minX = longitudeToTileX(bounds.southwest.longitude, zoom);
        const maxX = longitudeToTileX(bounds.northeast.longitude, zoom);
        const minY = latitudeToTileY(bounds.northeast.latitude, zoom);
        const maxY = latitudeToTileY(bounds.southwest.latitude, zoom);

        // Create queue for tiles at this zoom level
        const tileQueue = [];
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            tileQueue.push({ x, y, zoom });
          }
        }

        // Process queue with concurrency control
        for (let i = 0; i < tileQueue.length; i += maxConcurrent) {
          const chunk = tileQueue.slice(i, i + maxConcurrent);

          // Download tiles in parallel
          await Promise.all(
            chunk.map(async (tile) => {
              try {
                const { x, y, zoom } = tile;
                const url = urlTemplate
                  .replace("{z}", zoom)
                  .replace("{x}", x)
                  .replace("{y}", y);

                const tilePath = path.join(zoomDir, `${x}-${y}.png`);

                // Check if file already exists
                if (await fs.pathExists(tilePath)) {
                  downloadedTiles++;
                  return;
                }

                // Download tile
                const response = await axios({
                  url: url,
                  method: "GET",
                  responseType: "arraybuffer",
                  headers: {
                    "User-Agent": "MarkerTPH-Server/1.0",
                    Accept: "image/png,image/*;q=0.9",
                  },
                  timeout: 5000,
                });

                if (response.status === 200) {
                  // Save tile to disk
                  await fs.writeFile(tilePath, response.data);
                  downloadedTiles++;
                } else {
                  failedTiles++;
                  console.warn(
                    `Failed to download tile ${zoom}/${x}/${y}: ${response.status}`
                  );
                }
              } catch (error) {
                failedTiles++;
                console.error(`Error downloading tile: ${error.message}`);
              }
            })
          );

          // Log progress
          const progress = Math.round((downloadedTiles / totalTiles) * 100);
          console.log(
            `Progress: ${downloadedTiles}/${totalTiles} tiles downloaded (${progress}%)`
          );

          // Add small delay to prevent rate-limiting
          await delay(100);
        }
      }

      // Calculate total size of downloaded files
      let totalSize = 0;
      const getDirectorySize = async (directory) => {
        const files = await fs.readdir(directory);

        for (const file of files) {
          const filePath = path.join(directory, file);
          const stats = await fs.stat(filePath);

          if (stats.isDirectory()) {
            await getDirectorySize(filePath);
          } else {
            totalSize += stats.size;
          }
        }
      };

      await getDirectorySize(mapRegionsDir);

      // Create metadata for the region
      const regionMetadata = {
        id: regionId,
        name: estateName,
        estateAbbr: estateAbbr,
        estateId: estateId,
        mapType: Object.keys(MAP_PROVIDERS).indexOf(mapType),
        bounds: {
          sw_lat: bounds.southwest.latitude,
          sw_lng: bounds.southwest.longitude,
          ne_lat: bounds.northeast.latitude,
          ne_lng: bounds.northeast.longitude,
        },
        minZoom,
        maxZoom,
        path: `map_regions/${formattedName}`,
        dateCreated: new Date().toISOString(),
        tileCount: downloadedTiles,
        sizeInBytes: totalSize,
      };

      // Save metadata to file
      const metadataPath = path.join(outputDir, "region_metadata.json");
      await fs.writeFile(metadataPath, JSON.stringify(regionMetadata, null, 2));

      // Create ZIP file for download
      const zipPath = path.join(this.downloadsPath, `${formattedName}.zip`);
      await fs.ensureDir(this.downloadsPath);

      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", {
        zlib: { level: 9 }, // Maximum compression
      });

      archive.pipe(output);

      // Add map_regions directory to ZIP
      archive.directory(path.join(outputDir, "map_regions"), "map_regions");

      // Add metadata file
      archive.file(metadataPath, { name: "region_metadata.json" });

      await new Promise((resolve, reject) => {
        output.on("close", resolve);
        archive.on("error", reject);
        archive.finalize();
      });

      // Remove source files after ZIP creation to save storage space
      try {
        console.log(`Removing source directory to save space: ${outputDir}`);
        await fs.remove(outputDir);
      } catch (cleanupError) {
        console.warn(
          `Warning: Could not remove source directory ${outputDir}:`,
          cleanupError.message
        );
      }

      // Return result
      return {
        success: true,
        estateName,
        estateAbbr,
        mapType,
        downloadedTiles,
        failedTiles,
        totalSize: formatSize(totalSize),
        sizeBytesRaw: totalSize,
        metadata: regionMetadata,
        zipFilePath: zipPath,
        downloadUrl: `/api/maps/download/${formattedName}.zip`,
      };
    } catch (error) {
      console.error("Error generating offline map:", error);
      throw error;
    }
  }

  /**
   * Generate offline map with chunked download support
   */
  async generateOfflineMapChunked({
    estateId,
    estateName,
    estateAbbr,
    bounds,
    minZoom = 13,
    maxZoom = 22,
    mapType = "satellite",
    chunkSize = null,
  }) {
    try {
      // Validate required parameters
      if (!bounds || !estateName || !estateId) {
        throw new Error(
          "Missing required parameters: bounds, estateName, estateId"
        );
      }

      // Create unique ID and formatted name
      const downloadId = this.generateDownloadId(estateName);
      const formattedName = `${estateAbbr}_${estateName.replace(/\s+/g, "_")}`;

      // Set chunk size
      const actualChunkSize = chunkSize || this.defaultChunkSize;

      // Create directories
      await fs.ensureDir(this.chunksPath);
      await fs.ensureDir(this.metadataPath);
      await fs.ensureDir(this.downloadsPath);

      // Create progress metadata
      const progressMetadata = {
        downloadId,
        estateId,
        estateName,
        estateAbbr,
        formattedName,
        bounds,
        minZoom,
        maxZoom,
        mapType,
        chunkSize: actualChunkSize,
        status: "INITIALIZING", // INITIALIZING, DOWNLOADING, PROCESSING, CHUNKING, COMPLETED, PAUSED, ERROR
        totalTiles: 0,
        downloadedTiles: 0,
        failedTiles: 0,
        progress: 0,
        totalSize: 0,
        chunks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
      };

      // Save initial metadata
      const metadataFile = path.join(this.metadataPath, `${downloadId}.json`);
      await fs.writeFile(
        metadataFile,
        JSON.stringify(progressMetadata, null, 2)
      );

      // Calculate total tiles for progress tracking
      const totalTiles = calculateTileCount(bounds, minZoom, maxZoom);
      progressMetadata.totalTiles = totalTiles;
      progressMetadata.status = "DOWNLOADING";
      await this.updateProgress(downloadId, progressMetadata);

      console.log(
        `Starting chunked download for estate ${estateName} (ID: ${estateId})`
      );
      console.log(`Download ID: ${downloadId}`);
      console.log(`Total tiles to download: ${totalTiles}`);
      console.log(`Chunk size: ${formatSize(actualChunkSize)}`);

      // Generate the map using existing method but return download ID for tracking
      const mapResult = await this.generateMapWithProgress(downloadId, {
        estateId,
        estateName,
        estateAbbr,
        bounds,
        minZoom,
        maxZoom,
        mapType,
      });

      // Update status to processing/chunking
      progressMetadata.status = "CHUNKING";
      progressMetadata.downloadedTiles = mapResult.downloadedTiles;
      progressMetadata.failedTiles = mapResult.failedTiles;
      progressMetadata.totalSize = mapResult.sizeBytesRaw;
      await this.updateProgress(downloadId, progressMetadata);

      // Create chunks from the generated ZIP file
      const zipPath = mapResult.zipFilePath;
      const chunks = await this.createChunks(
        zipPath,
        actualChunkSize,
        downloadId
      );

      // Update metadata with chunk information
      progressMetadata.chunks = chunks;
      progressMetadata.status = "COMPLETED";
      progressMetadata.progress = 100;
      progressMetadata.updatedAt = new Date().toISOString();
      await this.updateProgress(downloadId, progressMetadata);

      // Also save standardized metadata format
      try {
        const standardizedMetadata = generateStandardizedMetadata({
          downloadId,
          estateId,
          estateName,
          estateAbbr,
          formattedName,
          bounds,
          minZoom,
          maxZoom,
          mapType,
          chunkSize: actualChunkSize,
          totalTiles: mapResult.downloadedTiles,
          downloadedTiles: mapResult.downloadedTiles,
          failedTiles: mapResult.failedTiles,
          progress: 100,
          totalSize: mapResult.sizeBytesRaw,
          chunks,
          createdAt: progressMetadata.createdAt,
          updatedAt: new Date().toISOString(),
          error: null,
        });

        await saveStandardizedMetadata(standardizedMetadata, this.metadataPath);
        console.log(
          `📄 Standardized metadata saved for download ID: ${downloadId}`
        );
      } catch (metadataError) {
        console.warn(
          `Warning: Could not save standardized metadata:`,
          metadataError.message
        );
      }

      // Clean up original ZIP file to save space
      try {
        await fs.remove(zipPath);
      } catch (cleanupError) {
        console.warn(
          `Warning: Could not remove original ZIP file:`,
          cleanupError.message
        );
      }

      return {
        success: true,
        downloadId,
        estateName,
        estateAbbr,
        mapType,
        totalTiles: mapResult.downloadedTiles,
        failedTiles: mapResult.failedTiles,
        totalSize: formatSize(mapResult.sizeBytesRaw),
        sizeBytesRaw: mapResult.sizeBytesRaw,
        chunkSize: formatSize(actualChunkSize),
        chunksCount: chunks.length,
        chunks: chunks.map((chunk) => ({
          index: chunk.index,
          filename: chunk.filename,
          size: formatSize(chunk.size),
          downloadUrl: `/api/maps/download-chunk/${downloadId}/${chunk.index}`,
        })),
        metadata: progressMetadata,
        downloadUrl: `/api/maps/download-chunked/${downloadId}`,
        progressUrl: `/api/maps/progress/${downloadId}`,
      };
    } catch (error) {
      // Update metadata with error
      try {
        const errorMetadata = {
          status: "ERROR",
          error: error.message,
          updatedAt: new Date().toISOString(),
        };
        await this.updateProgress(downloadId || "unknown", errorMetadata);
      } catch (updateError) {
        console.error("Error updating progress with error:", updateError);
      }

      console.error("Error generating chunked offline map:", error);
      throw error;
    }
  }

  /**
   * Generate map with progress tracking
   */
  async generateMapWithProgress(downloadId, options) {
    // This is similar to existing generateOfflineMap but with progress callbacks
    const {
      estateId,
      estateName,
      estateAbbr,
      bounds,
      minZoom,
      maxZoom,
      mapType,
    } = options;

    // Create directories for storing tiles
    const regionId = `estate_${estateId}_${Date.now()}`;
    const formattedName = `${estateAbbr}_${estateName.replace(/\s+/g, "_")}`;
    const outputDir = path.join(this.outputPath, formattedName);
    const mapRegionsDir = path.join(outputDir, "map_regions", formattedName);

    await fs.ensureDir(outputDir);
    await fs.ensureDir(mapRegionsDir);

    // Get URL template and set concurrency limit
    const urlTemplate = MAP_PROVIDERS[mapType];
    if (!urlTemplate) {
      throw new Error(
        `Invalid map type: ${mapType}. Available types: ${Object.keys(
          MAP_PROVIDERS
        ).join(", ")}`
      );
    }

    const maxConcurrent = 20;
    let downloadedTiles = 0;
    let failedTiles = 0;
    const totalTiles = calculateTileCount(bounds, minZoom, maxZoom);

    // Download tiles for each zoom level with progress tracking
    for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
      const zoomDir = path.join(mapRegionsDir, zoom.toString());
      await fs.ensureDir(zoomDir);

      const minX = longitudeToTileX(bounds.southwest.longitude, zoom);
      const maxX = longitudeToTileX(bounds.northeast.longitude, zoom);
      const minY = latitudeToTileY(bounds.northeast.latitude, zoom);
      const maxY = latitudeToTileY(bounds.southwest.latitude, zoom);

      // Create queue for tiles at this zoom level
      const tileQueue = [];
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          tileQueue.push({ x, y, zoom });
        }
      }

      // Process queue with concurrency control and progress tracking
      for (let i = 0; i < tileQueue.length; i += maxConcurrent) {
        // Check if download is paused
        const currentProgress = await this.getProgress(downloadId);
        if (currentProgress && currentProgress.status === "PAUSED") {
          throw new Error("Download paused by user");
        }

        const chunk = tileQueue.slice(i, i + maxConcurrent);

        // Download tiles in parallel
        await Promise.all(
          chunk.map(async (tile) => {
            try {
              const { x, y, zoom } = tile;
              const url = urlTemplate
                .replace("{z}", zoom)
                .replace("{x}", x)
                .replace("{y}", y);

              const tilePath = path.join(zoomDir, `${x}-${y}.png`);

              // Check if file already exists
              if (await fs.pathExists(tilePath)) {
                downloadedTiles++;
                return;
              }

              // Download tile
              const response = await axios({
                url: url,
                method: "GET",
                responseType: "arraybuffer",
                headers: {
                  "User-Agent": "MarkerTPH-Server/1.0",
                  Accept: "image/png,image/*;q=0.9",
                },
                timeout: 5000,
              });

              if (response.status === 200) {
                await fs.writeFile(tilePath, response.data);
                downloadedTiles++;
              } else {
                failedTiles++;
                console.warn(
                  `Failed to download tile ${zoom}/${x}/${y}: ${response.status}`
                );
              }
            } catch (error) {
              failedTiles++;
              console.error(`Error downloading tile: ${error.message}`);
            }
          })
        );

        // Update progress
        const progress = Math.round((downloadedTiles / totalTiles) * 90); // 90% for download, 10% for processing
        await this.updateProgress(downloadId, {
          downloadedTiles,
          failedTiles,
          progress,
          updatedAt: new Date().toISOString(),
        });

        console.log(
          `Progress: ${downloadedTiles}/${totalTiles} tiles downloaded (${progress}%)`
        );

        // Add small delay to prevent rate-limiting
        await delay(100);
      }
    }

    // Calculate total size
    let totalSize = 0;
    const getDirectorySize = async (directory) => {
      const files = await fs.readdir(directory);

      for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
          await getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    };

    await getDirectorySize(mapRegionsDir);

    // Create metadata
    const regionMetadata = {
      id: regionId,
      name: estateName,
      estateAbbr: estateAbbr,
      estateId: estateId,
      mapType: Object.keys(MAP_PROVIDERS).indexOf(mapType),
      bounds: {
        sw_lat: bounds.southwest.latitude,
        sw_lng: bounds.southwest.longitude,
        ne_lat: bounds.northeast.latitude,
        ne_lng: bounds.northeast.longitude,
      },
      minZoom,
      maxZoom,
      path: `map_regions/${formattedName}`,
      dateCreated: new Date().toISOString(),
      tileCount: downloadedTiles,
      sizeInBytes: totalSize,
    };

    // Save metadata to file
    const metadataPath = path.join(outputDir, "region_metadata.json");
    await fs.writeFile(metadataPath, JSON.stringify(regionMetadata, null, 2));

    // Create ZIP file
    const zipPath = path.join(this.outputPath, `${formattedName}_temp.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.pipe(output);
    archive.directory(path.join(outputDir, "map_regions"), "map_regions");
    archive.file(metadataPath, { name: "region_metadata.json" });

    await new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.finalize();
    });

    // Remove source files
    try {
      await fs.remove(outputDir);
    } catch (cleanupError) {
      console.warn(
        `Warning: Could not remove source directory:`,
        cleanupError.message
      );
    }

    return {
      downloadedTiles,
      failedTiles,
      sizeBytesRaw: totalSize,
      zipFilePath: zipPath,
      metadata: regionMetadata,
    };
  }

  /**
   * Create chunks from ZIP file
   */
  async createChunks(zipFilePath, chunkSize, downloadId, estateName = null) {
    const chunks = [];
    const zipStats = await fs.stat(zipFilePath);
    const totalSize = zipStats.size;
    const chunkCount = Math.ceil(totalSize / chunkSize);

    console.log(
      `Creating ${chunkCount} chunks of max ${formatSize(
        chunkSize
      )} each from file size ${formatSize(totalSize)}`
    );

    const chunkDir = path.join(this.chunksPath, downloadId);
    await fs.ensureDir(chunkDir);

    const buffer = await fs.readFile(zipFilePath);
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalSize) {
      const remainingBytes = totalSize - offset;
      const currentChunkSize = Math.min(chunkSize, remainingBytes);

      // Extract chunk data
      const chunkData = buffer.subarray(offset, offset + currentChunkSize);

      // Create chunk filename
      const chunkFilename = `chunk_${chunkIndex
        .toString()
        .padStart(3, "0")}.bin`;
      const chunkPath = path.join(chunkDir, chunkFilename);

      // Write chunk to file
      await fs.writeFile(chunkPath, chunkData);

      // Calculate checksum
      const checksum = crypto.createHash("md5").update(chunkData).digest("hex");

      chunks.push({
        index: chunkIndex,
        filename: chunkFilename,
        path: chunkPath,
        size: currentChunkSize,
        checksum: checksum,
      });

      console.log(
        `Created chunk ${chunkIndex}: ${chunkFilename} (${formatSize(
          currentChunkSize
        )})`
      );

      offset += currentChunkSize;
      chunkIndex++;
    }

    console.log(`Successfully created ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Update download progress
   */
  async updateProgress(downloadId, updates) {
    try {
      const metadataFile = path.join(this.metadataPath, `${downloadId}.json`);

      let currentMetadata = {};
      if (await fs.pathExists(metadataFile)) {
        const data = await fs.readFile(metadataFile, "utf8");
        currentMetadata = JSON.parse(data);
      }

      // Merge updates
      const updatedMetadata = { ...currentMetadata, ...updates };
      updatedMetadata.updatedAt = new Date().toISOString();

      await fs.writeFile(
        metadataFile,
        JSON.stringify(updatedMetadata, null, 2)
      );

      return updatedMetadata;
    } catch (error) {
      console.error("Error updating progress:", error);
      throw error;
    }
  }

  /**
   * Get download progress
   */
  async getProgress(downloadId) {
    try {
      const metadataFile = path.join(this.metadataPath, `${downloadId}.json`);

      if (await fs.pathExists(metadataFile)) {
        const data = await fs.readFile(metadataFile, "utf8");
        return JSON.parse(data);
      }

      return null;
    } catch (error) {
      console.error("Error getting progress:", error);
      return null;
    }
  }

  /**
   * Get chunk file for download
   */
  async getChunkFile(downloadId, chunkIndex) {
    try {
      const chunkDir = path.join(this.chunksPath, downloadId);
      const chunkFilename = `chunk_${chunkIndex
        .toString()
        .padStart(3, "0")}.bin`;
      const chunkPath = path.join(chunkDir, chunkFilename);

      if (await fs.pathExists(chunkPath)) {
        return chunkPath;
      }

      return null;
    } catch (error) {
      console.error("Error getting chunk file:", error);
      return null;
    }
  }

  /**
   * Create chunks from existing ZIP file (for NBE ESTATE)
   */
  async createChunksFromExistingZip(
    zipFilePath,
    chunkSize = null,
    estateName = null
  ) {
    try {
      const actualChunkSize = chunkSize || this.defaultChunkSize;
      const downloadId = this.generateDownloadId(estateName);

      console.log(`Creating chunks from existing ZIP: ${zipFilePath}`);
      console.log(`Chunk size: ${formatSize(actualChunkSize)}`);

      // Create chunks directory
      const chunkDir = path.join(this.chunksPath, downloadId);
      await fs.ensureDir(chunkDir);

      // Read ZIP file
      const zipStats = await fs.stat(zipFilePath);
      const totalSize = zipStats.size;
      const chunkCount = Math.ceil(totalSize / actualChunkSize);

      console.log(
        `Creating ${chunkCount} chunks from file size ${formatSize(totalSize)}`
      );

      const buffer = await fs.readFile(zipFilePath);
      const chunks = [];
      let offset = 0;
      let chunkIndex = 0;

      while (offset < totalSize) {
        const remainingBytes = totalSize - offset;
        const currentChunkSize = Math.min(actualChunkSize, remainingBytes);

        // Extract chunk data
        const chunkData = buffer.subarray(offset, offset + currentChunkSize);

        // Create chunk filename
        const chunkFilename = `chunk_${chunkIndex
          .toString()
          .padStart(3, "0")}.bin`;
        const chunkPath = path.join(chunkDir, chunkFilename);

        // Write chunk to file
        await fs.writeFile(chunkPath, chunkData);

        // Calculate checksum
        const checksum = crypto
          .createHash("md5")
          .update(chunkData)
          .digest("hex");

        chunks.push({
          index: chunkIndex,
          filename: chunkFilename,
          path: chunkPath,
          size: currentChunkSize,
          checksum: checksum,
        });

        console.log(
          `Created chunk ${chunkIndex}: ${chunkFilename} (${formatSize(
            currentChunkSize
          )})`
        );

        offset += currentChunkSize;
        chunkIndex++;
      }

      console.log(
        `Successfully created ${chunks.length} chunks for download ID: ${downloadId}`
      );

      // Create standardized metadata if estate name is provided
      if (estateName) {
        try {
          const standardizedMetadata = generateStandardizedMetadata({
            downloadId,
            estateId: 0, // Default value, should be provided by caller
            estateName: estateName.replace(/_/g, " "),
            estateAbbr: estateName.split("_")[0],
            formattedName: estateName,
            bounds: {
              southwest: { latitude: 0, longitude: 0 },
              northeast: { latitude: 0, longitude: 0 },
            },
            minZoom: 14,
            maxZoom: 17,
            mapType: "satellite",
            chunkSize: actualChunkSize,
            totalTiles: 0, // Will be calculated from actual tiles
            downloadedTiles: 0,
            failedTiles: 0,
            progress: 100,
            totalSize,
            chunks,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            error: null,
          });

          // Save standardized metadata to metadata directory
          await fs.ensureDir(this.metadataPath);
          await saveStandardizedMetadata(
            standardizedMetadata,
            this.metadataPath
          );
          console.log(
            `📄 Standardized metadata saved for download ID: ${downloadId}`
          );
        } catch (metadataError) {
          console.warn(
            `Warning: Could not save standardized metadata:`,
            metadataError.message
          );
        }
      }

      return {
        downloadId,
        chunks,
        totalSize,
        chunkSize: actualChunkSize,
        chunkCount: chunks.length,
      };
    } catch (error) {
      console.error("Error creating chunks from existing ZIP:", error);
      throw error;
    }
  }

  /**
   * Reconstruct ZIP from chunks
   */
  async reconstructZipFromChunks(downloadId, outputPath) {
    try {
      const chunkDir = path.join(this.chunksPath, downloadId);

      if (!(await fs.pathExists(chunkDir))) {
        throw new Error(`Chunk directory not found: ${chunkDir}`);
      }

      // Get all chunk files
      const files = await fs.readdir(chunkDir);
      const chunkFiles = files
        .filter((file) => file.startsWith("chunk_") && file.endsWith(".bin"))
        .sort((a, b) => {
          const aIndex = parseInt(a.match(/chunk_(\d+)\.bin/)[1]);
          const bIndex = parseInt(b.match(/chunk_(\d+)\.bin/)[1]);
          return aIndex - bIndex;
        });

      console.log(`Found ${chunkFiles.length} chunk files`);

      // Read all chunks and combine
      const chunks = [];
      for (const chunkFile of chunkFiles) {
        const chunkPath = path.join(chunkDir, chunkFile);
        const chunkData = await fs.readFile(chunkPath);
        chunks.push(chunkData);
      }

      // Combine all chunks
      const combinedBuffer = Buffer.concat(chunks);

      // Write to output file
      await fs.writeFile(outputPath, combinedBuffer);

      console.log(`Successfully reconstructed ZIP file: ${outputPath}`);
      console.log(`File size: ${formatSize(combinedBuffer.length)}`);

      return {
        success: true,
        outputPath,
        size: combinedBuffer.length,
        chunksUsed: chunkFiles.length,
      };
    } catch (error) {
      console.error("Error reconstructing ZIP from chunks:", error);
      throw error;
    }
  }

  /**
   * List all downloads
   */
  async listDownloads() {
    try {
      const downloads = [];

      // Check if metadata directory exists
      if (!(await fs.pathExists(this.metadataPath))) {
        return downloads;
      }

      // Get all metadata files
      const files = await fs.readdir(this.metadataPath);
      const metadataFiles = files.filter((file) => file.endsWith(".json"));

      for (const file of metadataFiles) {
        try {
          const filePath = path.join(this.metadataPath, file);
          const data = await fs.readFile(filePath, "utf8");
          const metadata = JSON.parse(data);

          // Add download info
          downloads.push({
            downloadId: metadata.downloadId,
            estateName: metadata.estateName,
            estateAbbr: metadata.estateAbbr,
            status: metadata.status,
            progress: metadata.progress || 0,
            totalTiles: metadata.totalTiles || 0,
            downloadedTiles: metadata.downloadedTiles || 0,
            totalSize: metadata.totalSize || 0,
            chunkCount: metadata.chunks ? metadata.chunks.length : 0,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
          });
        } catch (error) {
          console.warn(`Error reading metadata file ${file}:`, error.message);
        }
      }

      // Sort by creation date (newest first)
      downloads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return downloads;
    } catch (error) {
      console.error("Error listing downloads:", error);
      throw error;
    }
  }
}

module.exports = new MapGeneratorService();
