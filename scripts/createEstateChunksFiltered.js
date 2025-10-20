const path = require("path");
const fs = require("fs-extra");
const MapGeneratorService = require("../services/MapGeneratorService");

async function createEstateChunksFiltered(
  estateName,
  estateDir,
  outputZipPath,
  zoomLevels = null,
  chunkSize = null
) {
  try {
    console.log(`🚀 Starting ${estateName} filtered chunk creation process...`);
    console.log(`📁 ${estateName} directory: ${estateDir}`);
    console.log(`📦 Output ZIP path: ${outputZipPath}`);

    // Check if estate directory exists
    if (!(await fs.pathExists(estateDir))) {
      throw new Error(`${estateName} directory not found: ${estateDir}`);
    }

    // Read region_metadata.json to get zoom range and estate info
    const metadataPath = path.join(estateDir, "region_metadata.json");
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
        `⚠️  No region_metadata.json found in ${estateDir}, using default zoom levels`
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
    const tempDir = path.join(tempBaseDir, `${estateName}_filtered`);

    // Create the estate parent directory structure
    const estateParentDir = path.join(
      tempDir,
      estateName.replace(/_filtered$/, "")
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

      // Count tiles in this zoom level (handle nested structure)
      let tileCount = 0;
      const countTilesInDir = async (dir) => {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            await countTilesInDir(filePath);
          } else if (file.endsWith(".png")) {
            tileCount++;
          }
        }
      };

      await countTilesInDir(targetZoomDir);
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
      tileCount: 0, // Will be updated after counting
      sizeInBytes: 0, // Will be updated after calculating
    };

    console.log(
      `📄 Creating new region_metadata.json with ID: ${newRegionMetadata.id}`
    );

    // Calculate total tiles and size
    let totalTiles = 0;
    let totalSize = 0;

    const countTilesAndSizeInDir = async (dir) => {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          await countTilesAndSizeInDir(filePath);
        } else if (file.endsWith(".png")) {
          totalTiles++;
          totalSize += stats.size;
        }
      }
    };

    for (const zoom of filteredZoomLevels) {
      const zoomDir = path.join(tempMapRegionsDir, zoom.toString());
      await countTilesAndSizeInDir(zoomDir);
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

    console.log(`📊 Filtered data summary:`);
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
      `${estateName}_filtered.zip`
    );

    // Create ZIP file from filtered estate directory
    console.log(
      `📦 Creating ZIP file from filtered ${estateName} directory...`
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
    console.log("🔨 Creating chunks from filtered ZIP file...");
    const chunkResult = await MapGeneratorService.createChunksFromExistingZip(
      finalOutputZipPath,
      chunkSize,
      estateName
    );

    console.log("✅ Filtered chunk creation completed!");
    console.log(`📊 Results:`);
    console.log(`   - Download ID: ${chunkResult.downloadId}`);
    console.log(`   - Total chunks: ${chunkResult.chunkCount}`);
    console.log(`   - Chunk size: ${chunkResult.chunkSize} bytes`);
    console.log(`   - Total size: ${chunkResult.totalSize} bytes`);
    console.log(`   - Zoom levels included: ${filteredZoomLevels.join(", ")}`);
    console.log(`   - Total tiles: ${totalTiles}`);

    // Create a metadata file for easy reference in result directory
    const metadata = {
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
      chunks: chunkResult.chunks.map((chunk) => ({
        index: chunk.index,
        filename: chunk.filename,
        size: chunk.size,
        checksum: chunk.checksum,
      })),
    };

    const chunksMetadataPath = path.join(
      resultDir,
      `${estateName}_filtered_chunks_metadata.json`
    );
    await fs.writeFile(chunksMetadataPath, JSON.stringify(metadata, null, 2));

    console.log(`📄 Metadata saved to: ${chunksMetadataPath}`);

    // Test reconstruction
    console.log("🧪 Testing ZIP reconstruction...");
    const testOutputPath = path.join(
      resultDir,
      `${estateName}_filtered_reconstructed.zip`
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
      `\n🎉 ${estateName} filtered chunk creation process completed successfully!`
    );
    console.log("\n📋 Summary:");
    console.log(`   - Estate: ${estateName}`);
    console.log(`   - Zoom levels: ${filteredZoomLevels.join(", ")}`);
    console.log(`   - Total tiles: ${totalTiles}`);
    console.log(`   - Result ZIP: ${finalOutputZipPath}`);
    console.log(`   - Test reconstruction: ${testOutputPath}`);
    console.log(`   - Metadata file: ${chunksMetadataPath}`);
    console.log(
      `   - Chunks directory: ${path.join(
        __dirname,
        "../assets/maps/chunks",
        chunkResult.downloadId
      )}`
    );
    console.log(`   - Temporary files: ${tempDir}`);

    return {
      success: true,
      estateName,
      downloadId: chunkResult.downloadId,
      chunkCount: chunkResult.chunkCount,
      totalSize: chunkResult.totalSize,
      zoomLevels: filteredZoomLevels,
      totalTiles: totalTiles,
      metadataPath: chunksMetadataPath,
      originalZip: finalOutputZipPath,
      reconstructedZip: testOutputPath,
      tempDir: tempDir,
    };
  } catch (error) {
    console.error(`❌ Error creating ${estateName} filtered chunks:`, error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage:");
    console.log(
      "  node createEstateChunksFiltered.js <estateName> <estateDir> [outputZip] [zoomLevels] [chunkSize]"
    );
    console.log("");
    console.log("Examples:");
    console.log(
      "  node createEstateChunksFiltered.js BDE_ESTATE ./raw/BDE_BADIRIH_ESTATE"
    );
    console.log(
      '  node createEstateChunksFiltered.js NBE_ESTATE ./raw/NBE_NATAI_BARU_ESTATE ./NBE_ESTATE_filtered.zip "14,15,16,17" 2097152'
    );
    console.log(
      '  node createEstateChunksFiltered.js MY_ESTATE ./my_estate_folder ./my_estate.zip "14,15"'
    );
    console.log("");
    console.log(
      "Note: If no zoomLevels are provided, the script will read minZoom/maxZoom from region_metadata.json"
    );
    process.exit(1);
  }

  const estateName = args[0];
  const estateDir = args[1];
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

  createEstateChunksFiltered(
    estateName,
    estateDir,
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

module.exports = { createEstateChunksFiltered };
