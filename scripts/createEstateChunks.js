const path = require("path");
const fs = require("fs-extra");
const MapGeneratorService = require("../services/MapGeneratorService");
const {
  generateStandardizedMetadata,
  saveStandardizedMetadata,
} = require("./metadataUtils");

async function createEstateChunks(
  estateName,
  estateDir,
  outputZipPath,
  chunkSize = null
) {
  try {
    console.log(`🚀 Starting ${estateName} chunk creation process...`);

    console.log(`📁 ${estateName} directory: ${estateDir}`);
    console.log(`📦 Output ZIP path: ${outputZipPath}`);

    // Check if estate directory exists
    if (!(await fs.pathExists(estateDir))) {
      throw new Error(`${estateName} directory not found: ${estateDir}`);
    }

    // Create ZIP file from estate directory
    console.log(`📦 Creating ZIP file from ${estateName} directory...`);
    const archiver = require("archiver");
    const output = fs.createWriteStream(outputZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    archive.pipe(output);

    // Add the entire estate directory to ZIP
    archive.directory(estateDir, estateName);

    await new Promise((resolve, reject) => {
      output.on("close", () => {
        console.log(`✅ ZIP file created successfully: ${outputZipPath}`);
        console.log(`📊 ZIP file size: ${archive.pointer()} bytes`);
        resolve();
      });
      archive.on("error", reject);
      archive.finalize();
    });

    // Now create chunks from the ZIP file
    console.log("🔨 Creating chunks from ZIP file...");
    const chunkResult = await MapGeneratorService.createChunksFromExistingZip(
      outputZipPath,
      chunkSize,
      estateName
    );

    console.log("✅ Chunk creation completed!");
    console.log(`📊 Results:`);
    console.log(`   - Download ID: ${chunkResult.downloadId}`);
    console.log(`   - Total chunks: ${chunkResult.chunkCount}`);
    console.log(`   - Chunk size: ${chunkResult.chunkSize} bytes`);
    console.log(`   - Total size: ${chunkResult.totalSize} bytes`);

    // Create a metadata file for easy reference (legacy format)
    const legacyMetadata = {
      estateName,
      downloadId: chunkResult.downloadId,
      originalZip: outputZipPath,
      chunkCount: chunkResult.chunkCount,
      chunkSize: chunkResult.chunkSize,
      totalSize: chunkResult.totalSize,
      createdAt: new Date().toISOString(),
      chunks: chunkResult.chunks.map((chunk) => ({
        index: chunk.index,
        filename: chunk.filename,
        size: chunk.size,
        checksum: chunk.checksum,
      })),
    };

    const legacyMetadataPath = path.join(
      __dirname,
      `../${estateName}_chunks_metadata.json`
    );
    await fs.writeFile(
      legacyMetadataPath,
      JSON.stringify(legacyMetadata, null, 2)
    );

    console.log(`📄 Legacy metadata saved to: ${legacyMetadataPath}`);

    // Create standardized metadata format
    const standardizedMetadata = generateStandardizedMetadata({
      downloadId: chunkResult.downloadId,
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
      chunkSize: chunkResult.chunkSize,
      totalTiles: 0, // Will be calculated from actual tiles
      downloadedTiles: 0,
      failedTiles: 0,
      progress: 100,
      totalSize: chunkResult.totalSize,
      chunks: chunkResult.chunks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    });

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
      __dirname,
      `../${estateName}_reconstructed.zip`
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

    console.log(
      `\n🎉 ${estateName} chunk creation process completed successfully!`
    );
    console.log("\n📋 Summary:");
    console.log(`   - Estate: ${estateName}`);
    console.log(`   - Original ZIP: ${outputZipPath}`);
    console.log(
      `   - Chunks directory: ${path.join(
        __dirname,
        "../assets/maps/chunks",
        chunkResult.downloadId
      )}`
    );
    console.log(`   - Legacy metadata file: ${legacyMetadataPath}`);
    console.log(`   - Standardized metadata file: ${standardizedMetadataPath}`);
    console.log(`   - Test reconstruction: ${testOutputPath}`);

    return {
      success: true,
      estateName,
      downloadId: chunkResult.downloadId,
      chunkCount: chunkResult.chunkCount,
      totalSize: chunkResult.totalSize,
      legacyMetadataPath,
      standardizedMetadataPath,
      originalZip: outputZipPath,
      reconstructedZip: testOutputPath,
    };
  } catch (error) {
    console.error(`❌ Error creating ${estateName} chunks:`, error);
    throw error;
  }
}

// Helper function to create chunks for NBE ESTATE (backward compatibility)
async function createNBEChunks() {
  const estateName = "NBE_ESTATE";
  const estateDir = path.join(__dirname, "../NBE_ESTATE");
  const outputZipPath = path.join(__dirname, "../NBE_ESTATE.zip");

  return await createEstateChunks(estateName, estateDir, outputZipPath);
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Default to NBE ESTATE for backward compatibility
    createNBEChunks()
      .then((result) => {
        console.log("\n✅ Script completed successfully!");
        process.exit(0);
      })
      .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
      });
  } else if (args.length >= 2) {
    // Custom estate processing
    const estateName = args[0];
    const estateDir = args[1];
    const outputZipPath =
      args[2] || path.join(__dirname, `../${estateName}.zip`);
    const chunkSize = args[3] ? parseInt(args[3]) : null;

    createEstateChunks(estateName, estateDir, outputZipPath, chunkSize)
      .then((result) => {
        console.log("\n✅ Script completed successfully!");
        process.exit(0);
      })
      .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
      });
  } else {
    console.log("Usage:");
    console.log(
      "  node createNBEChunks.js                                    # Process NBE_ESTATE (default)"
    );
    console.log(
      "  node createNBEChunks.js <estateName> <estateDir> [outputZip] [chunkSize]"
    );
    console.log("");
    console.log("Examples:");
    console.log(
      "  node createNBEChunks.js                                    # Process NBE_ESTATE"
    );
    console.log(
      "  node createNBEChunks.js BDE_ESTATE ./BDE_ESTATE ./BDE_ESTATE.zip 2097152"
    );
    console.log("  node createNBEChunks.js MY_ESTATE ./my_estate_folder");
    process.exit(1);
  }
}

module.exports = { createEstateChunks, createNBEChunks };
