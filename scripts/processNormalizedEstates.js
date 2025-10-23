const path = require("path");
const fs = require("fs-extra");
const MapGeneratorService = require("../services/MapGeneratorService");
const {
  generateStandardizedMetadata,
  saveStandardizedMetadata,
  convertToStandardizedFormat,
} = require("./metadataUtils");

/**
 * Process normalized estates and create chunks
 * Works with the standardized x-y.webp format
 */
async function processNormalizedEstates(
  estateName,
  normalizedEstateDir,
  outputZipPath,
  zoomLevels = null,
  chunkSize = null
) {
  try {
    console.log(`🚀 Starting processing for normalized ${estateName}...`);
    console.log(`📁 Normalized estate directory: ${normalizedEstateDir}`);
    console.log(`📦 Output ZIP path: ${outputZipPath}`);

    // Check if normalized estate directory exists
    if (!(await fs.pathExists(normalizedEstateDir))) {
      throw new Error(
        `Normalized estate directory not found: ${normalizedEstateDir}`
      );
    }

    // Read region_metadata.json to get zoom range and estate info
    const metadataPath = path.join(normalizedEstateDir, "region_metadata.json");
    let estateMetadata = null;

    if (await fs.pathExists(metadataPath)) {
      const metadataContent = await fs.readFile(metadataPath, "utf8");
      estateMetadata = JSON.parse(metadataContent);
      console.log(
        `📄 Found estate metadata: ${estateMetadata.name} (${estateMetadata.estateAbbr})`
      );
      console.log(
        `🔍 Zoom range from metadata: ${estateMetadata.minZoom}-${estateMetadata.maxZoom}`
      );
    } else {
      console.warn(
        `⚠️  No region_metadata.json found in ${normalizedEstateDir}, using default zoom levels`
      );
    }

    // Determine zoom levels to use
    let targetZoomLevels;
    if (zoomLevels && zoomLevels.length > 0) {
      targetZoomLevels = zoomLevels;
      console.log(
        `🔍 Using provided zoom levels: ${targetZoomLevels.join(", ")}`
      );
    } else if (
      estateMetadata &&
      estateMetadata.minZoom &&
      estateMetadata.maxZoom
    ) {
      // Generate zoom levels from metadata
      targetZoomLevels = [];
      for (
        let zoom = estateMetadata.minZoom;
        zoom <= estateMetadata.maxZoom;
        zoom++
      ) {
        targetZoomLevels.push(zoom);
      }
      console.log(
        `🔍 Using zoom levels from metadata: ${targetZoomLevels.join(", ")}`
      );
    } else {
      // Fallback to default
      targetZoomLevels = [14, 15, 16, 17];
      console.log(
        `🔍 Using default zoom levels: ${targetZoomLevels.join(", ")}`
      );
    }

    // Find the map_regions directory structure
    const mapRegionsDir = path.join(normalizedEstateDir, "map_regions");
    if (!(await fs.pathExists(mapRegionsDir))) {
      throw new Error(
        `map_regions directory not found in ${normalizedEstateDir}`
      );
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

    // Filter to only include requested zoom levels
    const filteredZoomLevels = targetZoomLevels.filter((zoom) =>
      numericZoomLevels.includes(zoom)
    );
    console.log(`✅ Filtered zoom levels: ${filteredZoomLevels.join(", ")}`);

    if (filteredZoomLevels.length === 0) {
      throw new Error(
        `None of the requested zoom levels (${targetZoomLevels.join(
          ", "
        )}) were found in the estate data`
      );
    }

    // Create temporary filtered directory in temp/ folder
    const tempBaseDir = path.join(__dirname, "../temp");
    await fs.ensureDir(tempBaseDir);
    const tempDir = path.join(tempBaseDir, `${estateName}_normalized`);

    // Create the estate parent directory structure
    const estateParentDir = path.join(
      tempDir,
      estateName.replace(/_normalized$/, "")
    );
    const tempMapRegionsDir = path.join(
      estateParentDir,
      "map_regions",
      estateSubdir
    );

    console.log(`📁 Creating temporary filtered directory: ${tempDir}`);
    await fs.ensureDir(tempMapRegionsDir);

    // Copy only the requested zoom levels
    for (const zoom of filteredZoomLevels) {
      const sourceZoomDir = path.join(fullEstateDir, zoom.toString());
      const targetZoomDir = path.join(tempMapRegionsDir, zoom.toString());

      console.log(`📋 Copying zoom level ${zoom}...`);
      await fs.copy(sourceZoomDir, targetZoomDir);

      // Count tiles in this zoom level (now all in flat structure)
      let tileCount = 0;
      const files = await fs.readdir(targetZoomDir);
      for (const file of files) {
        if (file.endsWith(".webp")) {
          tileCount++;
        }
      }

      console.log(`   ✅ Copied ${tileCount} tiles for zoom level ${zoom}`);
    }

    // Create new region_metadata.json with updated information
    const timestamp = Date.now();
    const newRegionMetadata = {
      id: `estate_${estateMetadata.estateId}_${timestamp}`,
      name: estateMetadata.name,
      estateAbbr: estateMetadata.estateAbbr,
      estateId: estateMetadata.estateId,
      mapType: estateMetadata.mapType,
      bounds: estateMetadata.bounds,
      minZoom: Math.min(...filteredZoomLevels),
      maxZoom: Math.max(...filteredZoomLevels),
      path: `map_regions/${estateSubdir}`,
      dateCreated: new Date().toISOString(),
      normalized: true,
      normalizedAt: estateMetadata.normalizedAt || new Date().toISOString(),
      tileCount: 0, // Will be updated after counting
      sizeInBytes: 0, // Will be updated after calculating
    };

    console.log(
      `📄 Creating new region_metadata.json with ID: ${newRegionMetadata.id}`
    );

    // Calculate total tiles and size
    let totalTiles = 0;
    let totalSize = 0;

    for (const zoom of filteredZoomLevels) {
      const zoomDir = path.join(tempMapRegionsDir, zoom.toString());
      const files = await fs.readdir(zoomDir);

      for (const file of files) {
        if (file.endsWith(".webp")) {
          const filePath = path.join(zoomDir, file);
          const stats = await fs.stat(filePath);
          totalTiles++;
          totalSize += stats.size;
        }
      }
    }

    // Update metadata with calculated values
    newRegionMetadata.tileCount = totalTiles;
    newRegionMetadata.sizeInBytes = totalSize;

    // Save the updated region_metadata.json in the estate parent directory
    const metadataTarget = path.join(estateParentDir, "region_metadata.json");
    await fs.writeFile(
      metadataTarget,
      JSON.stringify(newRegionMetadata, null, 2)
    );
    console.log(`📄 Saved updated region_metadata.json`);

    console.log(`📊 Normalized data summary:`);
    console.log(`   - Zoom levels: ${filteredZoomLevels.join(", ")}`);
    console.log(`   - Total tiles: ${totalTiles}`);
    console.log(
      `   - Total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`
    );

    // Create result directory and update output paths
    const resultDir = path.join(__dirname, "../result");
    await fs.ensureDir(resultDir);

    // Update output ZIP path to result directory
    const finalOutputZipPath = path.join(
      resultDir,
      `${estateName}_normalized.zip`
    );

    // Create ZIP file from normalized estate directory
    console.log(
      `📦 Creating ZIP file from normalized ${estateName} directory...`
    );
    const archiver = require("archiver");
    const output = fs.createWriteStream(finalOutputZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    archive.pipe(output);

    // Add map_regions and region_metadata.json directly to ZIP root
    const mapRegionsSource = path.join(estateParentDir, "map_regions");
    const metadataSource = path.join(estateParentDir, "region_metadata.json");

    // Add map_regions directory to ZIP root
    archive.directory(mapRegionsSource, "map_regions");

    // Add region_metadata.json to ZIP root
    archive.file(metadataSource, { name: "region_metadata.json" });

    await new Promise((resolve, reject) => {
      output.on("close", () => {
        console.log(`✅ ZIP file created successfully: ${finalOutputZipPath}`);
        console.log(`📊 ZIP file size: ${archive.pointer()} bytes`);
        resolve();
      });
      archive.on("error", reject);
      archive.finalize();
    });

    // Now create chunks from the ZIP file
    console.log("🔨 Creating chunks from normalized ZIP file...");
    const chunkResult = await MapGeneratorService.createChunksFromExistingZip(
      finalOutputZipPath,
      chunkSize,
      estateName
    );

    console.log("✅ Normalized chunk creation completed!");
    console.log(`📊 Results:`);
    console.log(`   - Download ID: ${chunkResult.downloadId}`);
    console.log(`   - Total chunks: ${chunkResult.chunkCount}`);
    console.log(`   - Chunk size: ${chunkResult.chunkSize} bytes`);
    console.log(`   - Total size: ${chunkResult.totalSize} bytes`);
    console.log(`   - Zoom levels included: ${filteredZoomLevels.join(", ")}`);
    console.log(`   - Total tiles: ${totalTiles}`);

    // Create a metadata file for easy reference in result directory (legacy format)
    const legacyMetadata = {
      estateName,
      downloadId: chunkResult.downloadId,
      originalZip: finalOutputZipPath,
      chunkCount: chunkResult.chunkCount,
      chunkSize: chunkResult.chunkSize,
      totalSize: chunkResult.totalSize,
      zoomLevels: filteredZoomLevels,
      totalTiles: totalTiles,
      regionMetadata: newRegionMetadata,
      createdAt: new Date().toISOString(),
      normalized: true,
      chunks: chunkResult.chunks.map((chunk) => ({
        index: chunk.index,
        filename: chunk.filename,
        size: chunk.size,
        checksum: chunk.checksum,
      })),
    };

    const chunksMetadataPath = path.join(
      resultDir,
      `${estateName}_normalized_chunks_metadata.json`
    );
    await fs.writeFile(
      chunksMetadataPath,
      JSON.stringify(legacyMetadata, null, 2)
    );

    console.log(`📄 Legacy metadata saved to: ${chunksMetadataPath}`);

    // Create standardized metadata format
    const standardizedMetadata = convertToStandardizedFormat(
      legacyMetadata,
      newRegionMetadata
    );

    // Save standardized metadata to metadata directory
    const metadataDir = path.join(__dirname, "../assets/maps/metadata");
    await fs.ensureDir(metadataDir);
    const standardizedMetadataPath = await saveStandardizedMetadata(
      standardizedMetadata,
      metadataDir
    );

    // Test reconstruction
    console.log("🧪 Testing ZIP reconstruction...");
    const testOutputPath = path.join(
      resultDir,
      `${estateName}_normalized_reconstructed.zip`
    );
    const reconstructionResult =
      await MapGeneratorService.reconstructZipFromChunks(
        chunkResult.downloadId,
        testOutputPath
      );

    console.log("✅ ZIP reconstruction test completed!");
    console.log(`📦 Reconstructed ZIP: ${testOutputPath}`);
    console.log(`📊 Reconstructed size: ${reconstructionResult.size} bytes`);

    // Verify file sizes match
    if (reconstructionResult.size === chunkResult.totalSize) {
      console.log("✅ File size verification passed!");
    } else {
      console.warn("⚠️  File size mismatch detected!");
    }

    // Clean up temporary directory
    console.log("🧹 Cleaning up temporary directory...");
    await fs.remove(tempDir);

    console.log(
      `\n🎉 ${estateName} normalized processing completed successfully!`
    );
    console.log("\n📋 Summary:");
    console.log(`   - Estate: ${estateName}`);
    console.log(`   - Zoom levels: ${filteredZoomLevels.join(", ")}`);
    console.log(`   - Total tiles: ${totalTiles}`);
    console.log(`   - Result ZIP: ${finalOutputZipPath}`);
    console.log(`   - Test reconstruction: ${testOutputPath}`);
    console.log(`   - Legacy metadata file: ${chunksMetadataPath}`);
    console.log(`   - Standardized metadata file: ${standardizedMetadataPath}`);
    console.log(
      `   - Chunks directory: ${path.join(
        __dirname,
        "../assets/maps/chunks",
        chunkResult.downloadId
      )}`
    );

    return {
      success: true,
      estateName,
      downloadId: chunkResult.downloadId,
      chunkCount: chunkResult.chunkCount,
      totalSize: chunkResult.totalSize,
      zoomLevels: filteredZoomLevels,
      totalTiles: totalTiles,
      legacyMetadataPath: chunksMetadataPath,
      standardizedMetadataPath,
      originalZip: finalOutputZipPath,
      reconstructedZip: testOutputPath,
    };
  } catch (error) {
    console.error(`❌ Error processing normalized ${estateName}:`, error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage:");
    console.log(
      "  node processNormalizedEstates.js <estateName> <normalizedEstateDir> [outputZip] [zoomLevels] [chunkSize]"
    );
    console.log("");
    console.log("Examples:");
    console.log(
      "  node processNormalizedEstates.js BDE_ESTATE ./normalized/BDE_ESTATE"
    );
    console.log(
      '  node processNormalizedEstates.js NBE_ESTATE ./normalized/NBE_ESTATE ./NBE_ESTATE_normalized.zip "14,15,16,17" 2097152'
    );
    console.log(
      '  node processNormalizedEstates.js MY_ESTATE ./normalized/MY_ESTATE ./my_estate.zip "14,15"'
    );
    console.log("");
    console.log(
      "Note: This script works with normalized estate structures (x-y.webp format)"
    );
    process.exit(1);
  }

  const estateName = args[0];
  const normalizedEstateDir = args[1];
  const outputZipPath = args[2]; // Will be overridden to result directory
  const zoomLevelsStr = args[3];
  const chunkSize = args[4] ? parseInt(args[4]) : null;

  // Parse zoom levels (if provided)
  let zoomLevels = null;
  if (zoomLevelsStr) {
    zoomLevels = zoomLevelsStr
      .split(",")
      .map((z) => parseInt(z.trim()))
      .filter((z) => !isNaN(z));
  }

  processNormalizedEstates(
    estateName,
    normalizedEstateDir,
    outputZipPath,
    zoomLevels,
    chunkSize
  )
    .then((result) => {
      console.log("\n✅ Script completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Script failed:", error);
      process.exit(1);
    });
}

module.exports = { processNormalizedEstates };
