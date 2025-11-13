const path = require("path");
const fs = require("fs-extra");
const sharp = require("sharp");

/**
 * Convert tile X coordinate to longitude
 */
function tileXToLongitude(tileX, zoom) {
  return (tileX / Math.pow(2, zoom)) * 360 - 180;
}

/**
 * Convert tile Y coordinate to latitude
 */
function tileYToLatitude(tileY, zoom) {
  const n = Math.PI - (2 * Math.PI * tileY) / Math.pow(2, zoom);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/**
 * Calculate bounds from tile coordinates
 */
function calculateBoundsFromTiles(tileCoords) {
  if (!tileCoords || tileCoords.length === 0) {
    return null;
  }

  // Find min/max across all zoom levels
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const { x, y, zoom } of tileCoords) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  // Use the highest zoom level for more accurate bounds conversion
  // Find the highest zoom level used
  const maxZoom = Math.max(...tileCoords.map((coord) => coord.zoom));

  // Convert to lat/lng
  // SW corner: west edge (minX), south edge (maxY + 1)
  // NE corner: east edge (maxX + 1), north edge (minY)
  // Note: In tile coordinates, Y increases from north to south
  const sw_lng = tileXToLongitude(minX, maxZoom); // West edge of leftmost tile
  const sw_lat = tileYToLatitude(maxY + 1, maxZoom); // South edge of southernmost tile
  const ne_lng = tileXToLongitude(maxX + 1, maxZoom); // East edge of rightmost tile
  const ne_lat = tileYToLatitude(minY, maxZoom); // North edge of northernmost tile

  return {
    sw_lat,
    sw_lng,
    ne_lat,
    ne_lng,
  };
}

/**
 * Extract tile coordinates from filename
 */
function extractTileCoords(filename) {
  // Match x-y.webp, x-y.png, x-y.jpg, or x-y.jpeg format
  const match = filename.match(/^(\d+)-(\d+)\.(webp|png|jpg|jpeg)$/i);
  if (match) {
    return {
      x: parseInt(match[1], 10),
      y: parseInt(match[2], 10),
    };
  }
  return null;
}

/**
 * Normalizes estate folder structures to use consistent x-y.webp format
 * Handles both BDE (flat) and NBE (nested) structures
 * Converts PNG, JPG, and JPEG images to WebP format during normalization
 */
async function normalizeEstateStructure(estateDir, outputDir, estateName) {
  try {
    console.log(`🚀 Starting normalization for ${estateName}...`);
    console.log(`📁 Source directory: ${estateDir}`);
    console.log(`📁 Output directory: ${outputDir}`);

    // Check if estate directory exists
    if (!(await fs.pathExists(estateDir))) {
      throw new Error(`Estate directory not found: ${estateDir}`);
    }

    // Find the map_regions directory structure
    const mapRegionsDir = path.join(estateDir, "map_regions");
    if (!(await fs.pathExists(mapRegionsDir))) {
      throw new Error(`map_regions directory not found in ${estateDir}`);
    }

    // Find the estate subdirectory within map_regions
    const estateSubdirs = await fs.readdir(mapRegionsDir);
    let estateSubdir = null;

    for (const dir of estateSubdirs) {
      if (dir !== ".DS_Store") {
        const dirPath = path.join(mapRegionsDir, dir);
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
          estateSubdir = dir;
          break;
        }
      }
    }

    if (!estateSubdir) {
      throw new Error(`Estate subdirectory not found in map_regions`);
    }

    const fullEstateDir = path.join(mapRegionsDir, estateSubdir);
    console.log(`📂 Found estate data in: ${fullEstateDir}`);

    // Check available zoom levels
    const availableZoomLevels = await fs.readdir(fullEstateDir);
    const numericZoomLevels = [];

    for (const dir of availableZoomLevels) {
      if (!isNaN(parseInt(dir))) {
        const dirPath = path.join(fullEstateDir, dir);
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
          numericZoomLevels.push(parseInt(dir));
        }
      }
    }

    numericZoomLevels.sort((a, b) => a - b);
    console.log(`📊 Available zoom levels: ${numericZoomLevels.join(", ")}`);

    // Create output directory structure
    const normalizedEstateDir = path.join(outputDir, estateName);
    const normalizedMapRegionsDir = path.join(
      normalizedEstateDir,
      "map_regions",
      estateName
    );
    await fs.ensureDir(normalizedMapRegionsDir);

    let totalTilesProcessed = 0;
    let totalSize = 0;
    const allTileCoords = []; // Collect all tile coordinates for bounds calculation

    // Process each zoom level
    for (const zoom of numericZoomLevels) {
      const sourceZoomDir = path.join(fullEstateDir, zoom.toString());
      const targetZoomDir = path.join(normalizedMapRegionsDir, zoom.toString());

      console.log(`\n📋 Processing zoom level ${zoom}...`);
      await fs.ensureDir(targetZoomDir);

      // Process tiles in this zoom level
      const zoomStats = await processZoomLevel(
        sourceZoomDir,
        targetZoomDir,
        zoom,
        allTileCoords
      );
      totalTilesProcessed += zoomStats.tileCount;
      totalSize += zoomStats.totalSize;

      console.log(
        `   ✅ Processed ${zoomStats.tileCount} tiles (${(
          zoomStats.totalSize / 1024
        ).toFixed(2)} KB)`
      );
    }

    // Copy region_metadata.json if it exists
    const metadataPath = path.join(estateDir, "region_metadata.json");
    if (await fs.pathExists(metadataPath)) {
      const metadataContent = await fs.readFile(metadataPath, "utf8");
      const metadata = JSON.parse(metadataContent);

      // Update metadata with normalized structure info
      metadata.normalized = true;
      metadata.normalizedAt = new Date().toISOString();
      metadata.totalTiles = totalTilesProcessed;
      metadata.sizeInBytes = totalSize;

      // Calculate bounds from tiles if bounds is null
      if (!metadata.bounds || metadata.bounds === null) {
        if (allTileCoords.length > 0) {
          const calculatedBounds = calculateBoundsFromTiles(allTileCoords);
          if (calculatedBounds) {
            metadata.bounds = calculatedBounds;
            console.log(`📐 Calculated bounds from tiles:`, calculatedBounds);
          } else {
            console.log(`⚠️  Could not calculate bounds from tiles`);
          }
        } else {
          console.log(`⚠️  No tiles found to calculate bounds`);
        }
      } else {
        console.log(`📐 Using existing bounds from metadata`);
      }

      const normalizedMetadataPath = path.join(
        normalizedEstateDir,
        "region_metadata.json"
      );
      await fs.writeFile(
        normalizedMetadataPath,
        JSON.stringify(metadata, null, 2)
      );
      console.log(`📄 Updated region_metadata.json`);
    }

    console.log(`\n✅ Normalization completed!`);
    console.log(`📊 Summary:`);
    console.log(`   - Total tiles processed: ${totalTilesProcessed}`);
    console.log(
      `   - Total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`
    );
    console.log(`   - Zoom levels: ${numericZoomLevels.join(", ")}`);
    console.log(`   - Output directory: ${normalizedEstateDir}`);

    return {
      success: true,
      estateName,
      totalTiles: totalTilesProcessed,
      totalSize,
      zoomLevels: numericZoomLevels,
      outputDir: normalizedEstateDir,
    };
  } catch (error) {
    console.error(`❌ Error normalizing ${estateName}:`, error);
    throw error;
  }
}

/**
 * Process tiles in a zoom level directory
 * Handles both flat (BDE) and nested (NBE) structures
 * Converts PNG, JPG, and JPEG files to WebP format
 */
async function processZoomLevel(sourceDir, targetDir, zoom, tileCoordsArray) {
  let tileCount = 0;
  let totalSize = 0;

  // Recursively process all image files (PNG, JPG, JPEG)
  await processDirectory(
    sourceDir,
    targetDir,
    zoom,
    (count, size, tileCoord) => {
      tileCount += count;
      totalSize += size;
      if (tileCoord) {
        tileCoordsArray.push(tileCoord);
      }
    }
  );

  return { tileCount, totalSize };
}

/**
 * Recursively process directory and copy files with normalized names
 * Converts PNG, JPG, and JPEG files to WebP format
 */
async function processDirectory(sourceDir, targetDir, zoom, statsCallback) {
  const files = await fs.readdir(sourceDir);

  for (const file of files) {
    if (file === ".DS_Store") continue;

    const sourcePath = path.join(sourceDir, file);
    const stats = await fs.stat(sourcePath);

    if (stats.isDirectory()) {
      // Recursively process subdirectory
      await processDirectory(sourcePath, targetDir, zoom, statsCallback);
    } else if (file.match(/\.(png|jpg|jpeg)$/i)) {
      // Process image file (PNG, JPG, JPEG) and convert to WebP
      const normalizedFileName = await normalizeTileFileName(
        file,
        sourcePath,
        zoom
      );
      // Change extension to .webp
      const webpFileName = normalizedFileName.replace(
        /\.(png|jpg|jpeg)$/i,
        ".webp"
      );
      const targetPath = path.join(targetDir, webpFileName);

      // Extract tile coordinates for bounds calculation
      let tileCoord = null;
      const coords = extractTileCoords(webpFileName);
      if (coords) {
        tileCoord = {
          x: coords.x,
          y: coords.y,
          zoom: zoom,
        };
      }

      try {
        // Convert image to WebP
        await sharp(sourcePath)
          .resize(256, 256, {
            fit: "fill",
            kernel: sharp.kernel.lanczos3,
            withoutEnlargement: true,
          })
          .webp({
            quality: 80, // Or 80-90 depending on file size vs quality needs
            effort: 6,
            smartSubsample: true,
          })
          .toFile(targetPath);

        // Get the size of the converted file
        const convertedStats = await fs.stat(targetPath);

        // Update stats with tile coordinates
        statsCallback(1, convertedStats.size, tileCoord);
      } catch (error) {
        console.error(`❌ Error converting ${file} to WebP:`, error);
        // Fallback: copy original file (but rename extension to .webp)
        // Note: This is not ideal but ensures processing continues
        await fs.copy(sourcePath, targetPath);
        statsCallback(1, stats.size, tileCoord);
      }
    }
  }
}

/**
 * Normalize tile file name to x-y.webp format
 * Handles different naming patterns:
 * - BDE: already in x-y format (13388-8325.png/jpg/jpeg) -> 13388-8325.webp
 * - NBE: in subdirectory structure (13275/8311.png/jpg/jpeg -> 13275-8311.webp)
 */
async function normalizeTileFileName(originalFile, sourcePath, zoom) {
  // If already in x-y format (with any image extension), convert to x-y.webp
  if (originalFile.match(/^\d+-\d+\.(png|jpg|jpeg)$/i)) {
    return originalFile.replace(/\.(png|jpg|jpeg)$/i, ".webp");
  }

  // If it's just a number with image extension, we need to get the parent directory name
  if (originalFile.match(/^\d+\.(png|jpg|jpeg)$/i)) {
    const parentDir = path.basename(path.dirname(sourcePath));
    return `${parentDir}-${originalFile.replace(
      /\.(png|jpg|jpeg)$/i,
      ".webp"
    )}`;
  }

  // For any other format, try to extract numbers
  const numbers = originalFile.match(/\d+/g);
  if (numbers && numbers.length >= 2) {
    return `${numbers[0]}-${numbers[1]}.webp`;
  }

  // Fallback: use original filename with .webp extension
  console.warn(`⚠️  Could not normalize filename: ${originalFile}`);
  return originalFile.replace(/\.(png|jpg|jpeg)$/i, ".webp");
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log("Usage:");
    console.log(
      "  node normalizeEstateStructure.js <estateDir> <outputDir> <estateName>"
    );
    console.log("");
    console.log("Examples:");
    console.log(
      "  node normalizeEstateStructure.js ./raw/BDE_BADIRIH_ESTATE ./normalized BDE_ESTATE"
    );
    console.log(
      "  node normalizeEstateStructure.js ./raw/NBE_NATAI_BARU_ESTATE ./normalized NBE_ESTATE"
    );
    console.log("");
    console.log(
      "This script normalizes different estate folder structures to use consistent x-y.webp format"
    );
    console.log(
      "and converts PNG, JPG, and JPEG images to WebP format during normalization"
    );
    process.exit(1);
  }

  const estateDir = args[0];
  const outputDir = args[1];
  const estateName = args[2];

  normalizeEstateStructure(estateDir, outputDir, estateName)
    .then((result) => {
      console.log("\n✅ Normalization completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Normalization failed:", error);
      process.exit(1);
    });
}

module.exports = { normalizeEstateStructure };
