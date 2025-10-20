const path = require("path");
const fs = require("fs-extra");

/**
 * Normalizes estate folder structures to use consistent x-y.png format
 * Handles both BDE (flat) and NBE (nested) structures
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
        zoom
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
 */
async function processZoomLevel(sourceDir, targetDir, zoom) {
  let tileCount = 0;
  let totalSize = 0;

  // Recursively process all PNG files
  await processDirectory(sourceDir, targetDir, zoom, (count, size) => {
    tileCount += count;
    totalSize += size;
  });

  return { tileCount, totalSize };
}

/**
 * Recursively process directory and copy files with normalized names
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
    } else if (file.endsWith(".png")) {
      // Process PNG file
      const normalizedFileName = await normalizeTileFileName(
        file,
        sourcePath,
        zoom
      );
      const targetPath = path.join(targetDir, normalizedFileName);

      // Copy file to target directory
      await fs.copy(sourcePath, targetPath);

      // Update stats
      statsCallback(1, stats.size);
    }
  }
}

/**
 * Normalize tile file name to x-y.png format
 * Handles different naming patterns:
 * - BDE: already in x-y.png format (13388-8325.png)
 * - NBE: in subdirectory structure (13275/8311.png -> 13275-8311.png)
 */
async function normalizeTileFileName(originalFile, sourcePath, zoom) {
  // If already in x-y.png format, use as is
  if (originalFile.match(/^\d+-\d+\.png$/)) {
    return originalFile;
  }

  // If it's just a number.png, we need to get the parent directory name
  if (originalFile.match(/^\d+\.png$/)) {
    const parentDir = path.basename(path.dirname(sourcePath));
    return `${parentDir}-${originalFile}`;
  }

  // For any other format, try to extract numbers
  const numbers = originalFile.match(/\d+/g);
  if (numbers && numbers.length >= 2) {
    return `${numbers[0]}-${numbers[1]}.png`;
  }

  // Fallback: use original filename
  console.warn(`⚠️  Could not normalize filename: ${originalFile}`);
  return originalFile;
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
      "This script normalizes different estate folder structures to use consistent x-y.png format"
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
