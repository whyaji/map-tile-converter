const path = require("path");
const fs = require("fs-extra");

/**
 * Generate standardized metadata format for estate chunks
 * This matches the format used in the example 06f062fc-4679-47cc-83b8-3c20a17d2b27.json
 */
function generateStandardizedMetadata({
  downloadId,
  estateId,
  estateName,
  estateAbbr,
  formattedName,
  bounds,
  minZoom,
  maxZoom,
  mapType = "satellite",
  chunkSize,
  totalTiles,
  downloadedTiles,
  failedTiles = 0,
  progress = 100,
  totalSize,
  chunks,
  createdAt,
  updatedAt = null,
  error = null,
}) {
  // Convert bounds format if needed
  let convertedBounds;
  if (bounds.sw_lat !== undefined) {
    // Convert from sw_lat/sw_lng/ne_lat/ne_lng format
    convertedBounds = {
      southwest: {
        latitude: bounds.sw_lat,
        longitude: bounds.sw_lng,
      },
      northeast: {
        latitude: bounds.ne_lat,
        longitude: bounds.ne_lng,
      },
    };
  } else {
    // Already in the correct format
    convertedBounds = bounds;
  }

  // Convert mapType if it's a number
  let mapTypeString = mapType;
  if (typeof mapType === "number") {
    const mapTypes = ["standard", "satellite", "terrain", "hybrid"];
    mapTypeString = mapTypes[mapType] || "satellite";
  }

  // Format chunks with server paths
  const formattedChunks = chunks.map((chunk) => ({
    index: chunk.index,
    filename: chunk.filename,
    path: `/var/www/html/assets/maps/chunks/${downloadId}/${chunk.filename}`,
    size: chunk.size,
    checksum: chunk.checksum,
  }));

  return {
    downloadId,
    estateId,
    estateName,
    estateAbbr,
    formattedName,
    bounds: convertedBounds,
    minZoom,
    maxZoom,
    mapType: mapTypeString,
    chunkSize,
    status: "COMPLETED",
    totalTiles,
    downloadedTiles,
    failedTiles,
    progress,
    totalSize,
    chunks: formattedChunks,
    createdAt,
    updatedAt: updatedAt || createdAt,
    error,
  };
}

/**
 * Save standardized metadata to the metadata directory
 */
async function saveStandardizedMetadata(metadata, metadataDir) {
  const metadataPath = path.join(metadataDir, `${metadata.downloadId}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`📄 Standardized metadata saved to: ${metadataPath}`);
  return metadataPath;
}

/**
 * Convert existing metadata to standardized format
 */
function convertToStandardizedFormat(existingMetadata, regionMetadata = null) {
  // Extract estate information
  const estateId =
    regionMetadata?.estateId || existingMetadata.regionMetadata?.estateId;
  const estateName =
    regionMetadata?.name || existingMetadata.regionMetadata?.name;
  const estateAbbr =
    regionMetadata?.estateAbbr || existingMetadata.regionMetadata?.estateAbbr;
  const formattedName = existingMetadata.estateName;

  // Extract bounds
  const bounds =
    regionMetadata?.bounds || existingMetadata.regionMetadata?.bounds;

  // Extract zoom levels
  const minZoom =
    regionMetadata?.minZoom ||
    existingMetadata.regionMetadata?.minZoom ||
    existingMetadata.zoomLevels?.[0];
  const maxZoom =
    regionMetadata?.maxZoom ||
    existingMetadata.regionMetadata?.maxZoom ||
    existingMetadata.zoomLevels?.[existingMetadata.zoomLevels?.length - 1];

  // Extract map type
  const mapType =
    regionMetadata?.mapType || existingMetadata.regionMetadata?.mapType || 1;

  // Extract tile counts
  const totalTiles =
    existingMetadata.totalTiles || existingMetadata.regionMetadata?.tileCount;
  const downloadedTiles = totalTiles; // Assume all tiles were downloaded successfully

  // Extract size information
  const totalSize =
    existingMetadata.totalSize || existingMetadata.regionMetadata?.sizeInBytes;

  // Format chunks
  const chunks = existingMetadata.chunks || [];

  return generateStandardizedMetadata({
    downloadId: existingMetadata.downloadId,
    estateId,
    estateName,
    estateAbbr,
    formattedName,
    bounds,
    minZoom,
    maxZoom,
    mapType,
    chunkSize: existingMetadata.chunkSize,
    totalTiles,
    downloadedTiles,
    failedTiles: 0,
    progress: 100,
    totalSize,
    chunks,
    createdAt: existingMetadata.createdAt,
    updatedAt: existingMetadata.createdAt,
    error: null,
  });
}

module.exports = {
  generateStandardizedMetadata,
  saveStandardizedMetadata,
  convertToStandardizedFormat,
};
