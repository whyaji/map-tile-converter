const path = require("path");
const fs = require("fs-extra");
const { normalizeEstateStructure } = require("./normalizeEstateStructure");
const { processNormalizedEstates } = require("./processNormalizedEstates");

/**
 * Complete workflow: Normalize estate structure and create chunks
 * Handles both BDE (flat) and NBE (nested) structures
 */
async function processEstateWorkflow(
  estateName,
  rawEstateDir,
  outputDir,
  zoomLevels = null,
  chunkSize = null
) {
  try {
    console.log(`🚀 Starting complete workflow for ${estateName}...`);
    console.log(`📁 Raw estate directory: ${rawEstateDir}`);
    console.log(`📁 Output directory: ${outputDir}`);

    // Step 1: Normalize the estate structure
    console.log(`\n📋 Step 1: Normalizing estate structure...`);
    const normalizedDir = path.join(outputDir, "normalized");
    const normalizationResult = await normalizeEstateStructure(
      rawEstateDir,
      normalizedDir,
      estateName
    );

    if (!normalizationResult.success) {
      throw new Error("Normalization failed");
    }

    console.log(`✅ Normalization completed!`);
    console.log(`   - Total tiles: ${normalizationResult.totalTiles}`);
    console.log(
      `   - Total size: ${(
        normalizationResult.totalSize /
        (1024 * 1024)
      ).toFixed(2)} MB`
    );
    console.log(
      `   - Zoom levels: ${normalizationResult.zoomLevels.join(", ")}`
    );

    // Step 2: Process normalized estate and create chunks
    console.log(
      `\n📋 Step 2: Processing normalized estate and creating chunks...`
    );
    const normalizedEstateDir = path.join(normalizedDir, estateName);
    const processingResult = await processNormalizedEstates(
      estateName,
      normalizedEstateDir,
      null, // Will be set to result directory
      zoomLevels,
      chunkSize
    );

    if (!processingResult.success) {
      throw new Error("Processing failed");
    }

    console.log(`✅ Processing completed!`);
    console.log(`   - Download ID: ${processingResult.downloadId}`);
    console.log(`   - Total chunks: ${processingResult.chunkCount}`);
    console.log(
      `   - Total size: ${(processingResult.totalSize / (1024 * 1024)).toFixed(
        2
      )} MB`
    );

    // Step 3: Create summary report
    console.log(`\n📋 Step 3: Creating summary report...`);
    const summaryReport = {
      estateName,
      workflow: "complete",
      steps: {
        normalization: {
          success: true,
          totalTiles: normalizationResult.totalTiles,
          totalSize: normalizationResult.totalSize,
          zoomLevels: normalizationResult.zoomLevels,
          outputDir: normalizationResult.outputDir,
        },
        processing: {
          success: true,
          downloadId: processingResult.downloadId,
          chunkCount: processingResult.chunkCount,
          totalSize: processingResult.totalSize,
          zoomLevels: processingResult.zoomLevels,
          totalTiles: processingResult.totalTiles,
        },
      },
      files: {
        normalizedEstate: normalizedEstateDir,
        resultZip: processingResult.originalZip,
        reconstructedZip: processingResult.reconstructedZip,
        metadataFile: processingResult.metadataPath,
        chunksDir: path.join(
          __dirname,
          "../assets/maps/chunks",
          processingResult.downloadId
        ),
      },
      createdAt: new Date().toISOString(),
    };

    // Ensure result directory exists
    const resultDir = path.join(outputDir, "result");
    await fs.ensureDir(resultDir);

    const summaryPath = path.join(
      resultDir,
      `${estateName}_workflow_summary.json`
    );
    await fs.writeFile(summaryPath, JSON.stringify(summaryReport, null, 2));

    console.log(`✅ Summary report created: ${summaryPath}`);

    console.log(`\n🎉 Complete workflow finished successfully!`);
    console.log(`\n📋 Final Summary:`);
    console.log(`   - Estate: ${estateName}`);
    console.log(`   - Normalized tiles: ${normalizationResult.totalTiles}`);
    console.log(`   - Processed tiles: ${processingResult.totalTiles}`);
    console.log(`   - Zoom levels: ${processingResult.zoomLevels.join(", ")}`);
    console.log(`   - Total chunks: ${processingResult.chunkCount}`);
    console.log(`   - Download ID: ${processingResult.downloadId}`);
    console.log(`   - Result ZIP: ${processingResult.originalZip}`);
    console.log(`   - Summary report: ${summaryPath}`);

    return {
      success: true,
      estateName,
      normalization: normalizationResult,
      processing: processingResult,
      summaryReport,
      summaryPath,
    };
  } catch (error) {
    console.error(`❌ Error in workflow for ${estateName}:`, error);
    throw error;
  }
}

/**
 * Process multiple estates in batch
 */
async function processMultipleEstates(
  estates,
  outputDir,
  zoomLevels = null,
  chunkSize = null
) {
  console.log(`🚀 Starting batch processing for ${estates.length} estates...`);

  const results = [];

  for (let i = 0; i < estates.length; i++) {
    const estate = estates[i];
    console.log(
      `\n📋 Processing estate ${i + 1}/${estates.length}: ${estate.name}`
    );

    try {
      const result = await processEstateWorkflow(
        estate.name,
        estate.rawDir,
        outputDir,
        zoomLevels,
        chunkSize
      );
      results.push({ ...result, success: true });
    } catch (error) {
      console.error(`❌ Failed to process ${estate.name}:`, error.message);
      results.push({
        estateName: estate.name,
        success: false,
        error: error.message,
      });
    }
  }

  // Create batch summary
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\n📊 Batch processing completed!`);
  console.log(`   - Successful: ${successful.length}`);
  console.log(`   - Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log(`\n❌ Failed estates:`);
    failed.forEach((f) => console.log(`   - ${f.estateName}: ${f.error}`));
  }

  return results;
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage:");
    console.log(
      "  node processEstateWorkflow.js <estateName> <rawEstateDir> [outputDir] [zoomLevels] [chunkSize]"
    );
    console.log("");
    console.log("Examples:");
    console.log(
      "  node processEstateWorkflow.js BDE_ESTATE ./raw/BDE_BADIRIH_ESTATE"
    );
    console.log(
      "  node processEstateWorkflow.js NBE_ESTATE ./raw/NBE_NATAI_BARU_ESTATE ./output"
    );
    console.log(
      '  node processEstateWorkflow.js MY_ESTATE ./raw/MY_ESTATE ./output "14,15,16" 1048576'
    );
    console.log("");
    console.log("Batch processing:");
    console.log("  node processEstateWorkflow.js --batch");
    console.log("");
    console.log(
      "This script handles the complete workflow: normalize structure + create chunks"
    );
    process.exit(1);
  }

  // Check for batch mode
  if (args[0] === "--batch") {
    // Batch processing mode
    const estates = [
      { name: "BDE_ESTATE", rawDir: "./raw/BDE_BADIRIH_ESTATE" },
      { name: "NBE_ESTATE", rawDir: "./raw/NBE_NATAI_BARU_ESTATE" },
    ];

    const outputDir = args[1] || "./workflow_output";
    const zoomLevelsStr = args[2];
    const chunkSize = args[3] ? parseInt(args[3]) : null;

    // Parse zoom levels (if provided)
    let zoomLevels = null;
    if (zoomLevelsStr) {
      zoomLevels = zoomLevelsStr
        .split(",")
        .map((z) => parseInt(z.trim()))
        .filter((z) => !isNaN(z));
    }

    processMultipleEstates(estates, outputDir, zoomLevels, chunkSize)
      .then((results) => {
        console.log("\n✅ Batch processing completed!");
        process.exit(0);
      })
      .catch((error) => {
        console.error("\n❌ Batch processing failed:", error);
        process.exit(1);
      });
  } else {
    // Single estate processing
    const estateName = args[0];
    const rawEstateDir = args[1];
    const outputDir = args[2] || "./workflow_output";
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

    processEstateWorkflow(
      estateName,
      rawEstateDir,
      outputDir,
      zoomLevels,
      chunkSize
    )
      .then((result) => {
        console.log("\n✅ Workflow completed successfully!");
        process.exit(0);
      })
      .catch((error) => {
        console.error("\n❌ Workflow failed:", error);
        process.exit(1);
      });
  }
}

module.exports = { processEstateWorkflow, processMultipleEstates };
