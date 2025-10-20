const { createEstateChunks } = require("./createEstateChunks");
const MapGeneratorService = require("../services/MapGeneratorService");
const ChunkUtils = require("./chunkUtils");

async function runExample() {
  try {
    console.log("🚀 Map Tile Converter Example");
    console.log("==============================\n");

    // Example 1: Process NBE ESTATE
    console.log("📋 Example 1: Processing NBE ESTATE");
    console.log("-----------------------------------");

    const nbeResult = await createEstateChunks(
      "NBE_ESTATE",
      "./NBE_ESTATE",
      "./NBE_ESTATE.zip"
    );

    console.log("✅ NBE ESTATE processing completed!");
    console.log(`   - Download ID: ${nbeResult.downloadId}`);
    console.log(`   - Chunks: ${nbeResult.chunkCount}`);
    console.log(
      `   - Size: ${(nbeResult.totalSize / 1024 / 1024).toFixed(2)} MB\n`
    );

    // Example 2: Process BDE ESTATE (if exists)
    console.log("📋 Example 2: Processing BDE ESTATE");
    console.log("-----------------------------------");

    try {
      const bdeResult = await createEstateChunks(
        "BDE_ESTATE",
        "./BDE_BADIRIH_ESTATE",
        "./BDE_ESTATE.zip"
      );

      console.log("✅ BDE ESTATE processing completed!");
      console.log(`   - Download ID: ${bdeResult.downloadId}`);
      console.log(`   - Chunks: ${bdeResult.chunkCount}`);
      console.log(
        `   - Size: ${(bdeResult.totalSize / 1024 / 1024).toFixed(2)} MB\n`
      );
    } catch (error) {
      console.log("⚠️  BDE ESTATE not found, skipping...\n");
    }

    // Example 3: List all chunk sets
    console.log("📋 Example 3: Listing all chunk sets");
    console.log("------------------------------------");

    const chunkSets = await ChunkUtils.listChunkSets();
    console.log(`Found ${chunkSets.length} chunk sets:`);
    chunkSets.forEach((set) => {
      console.log(
        `   - ${set.downloadId}: ${set.chunkCount} chunks, ${(
          set.totalSize /
          1024 /
          1024
        ).toFixed(2)} MB`
      );
    });
    console.log("");

    // Example 4: Verify chunk integrity
    if (chunkSets.length > 0) {
      console.log("📋 Example 4: Verifying chunk integrity");
      console.log("---------------------------------------");

      const firstSet = chunkSets[0];
      const verification = await ChunkUtils.verifyChunkIntegrity(
        firstSet.downloadId
      );
      console.log(
        `Verification result: ${verification.isValid ? "VALID" : "INVALID"}`
      );
      console.log(`   - Valid chunks: ${verification.validChunks}`);
      console.log(`   - Invalid chunks: ${verification.invalidChunks}\n`);
    }

    // Example 5: Reconstruct ZIP from chunks
    if (chunkSets.length > 0) {
      console.log("📋 Example 5: Reconstructing ZIP from chunks");
      console.log("---------------------------------------------");

      const firstSet = chunkSets[0];
      const outputPath = `./reconstructed_${firstSet.downloadId}.zip`;

      const reconstruction = await ChunkUtils.reconstructZip(
        firstSet.downloadId,
        outputPath
      );

      console.log("✅ ZIP reconstruction completed!");
      console.log(`   - Output: ${reconstruction.outputPath}`);
      console.log(
        `   - Size: ${(reconstruction.size / 1024 / 1024).toFixed(2)} MB`
      );
      console.log(`   - Chunks used: ${reconstruction.chunksUsed}\n`);
    }

    console.log("🎉 All examples completed successfully!");
  } catch (error) {
    console.error("❌ Example failed:", error);
    process.exit(1);
  }
}

// Run the example if called directly
if (require.main === module) {
  runExample();
}

module.exports = runExample;
