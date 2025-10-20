const { createEstateChunks } = require("./createEstateChunks");
const { processNormalizedEstates } = require("./processNormalizedEstates");
const { convertExistingMetadata } = require("./convertExistingMetadata");

/**
 * Example usage of the updated scripts with standardized metadata format
 */
async function exampleUsage() {
  console.log(
    "🚀 Example usage of updated scripts with standardized metadata format\n"
  );

  try {
    // Example 1: Convert existing metadata files
    console.log("1️⃣ Converting existing metadata files...");
    await convertExistingMetadata();
    console.log("✅ Existing metadata conversion completed!\n");

    // Example 2: Process normalized estates (this will create both legacy and standardized metadata)
    console.log("2️⃣ Example: Processing normalized estates...");
    console.log(
      "   Command: node scripts/processNormalizedEstates.js <estateName> <normalizedEstateDir>"
    );
    console.log("   This will create:");
    console.log("   - Legacy metadata in result/ directory");
    console.log(
      "   - Standardized metadata in assets/maps/metadata/ directory\n"
    );

    // Example 3: Create estate chunks (this will also create both formats)
    console.log("3️⃣ Example: Creating estate chunks...");
    console.log(
      "   Command: node scripts/createEstateChunks.js <estateName> <estateDir> [outputZip] [chunkSize]"
    );
    console.log("   This will create:");
    console.log("   - Legacy metadata in root directory");
    console.log(
      "   - Standardized metadata in assets/maps/metadata/ directory\n"
    );

    console.log("📋 Summary of changes:");
    console.log("   ✅ All scripts now generate standardized metadata format");
    console.log("   ✅ Metadata files are saved with downloadId as filename");
    console.log(
      "   ✅ Metadata files are saved in assets/maps/metadata/ directory"
    );
    console.log(
      "   ✅ Format matches the example 06f062fc-4679-47cc-83b8-3c20a17d2b27.json"
    );
    console.log("   ✅ Backward compatibility maintained with legacy format");
  } catch (error) {
    console.error("❌ Error in example usage:", error);
    throw error;
  }
}

// Run the example if called directly
if (require.main === module) {
  exampleUsage()
    .then(() => {
      console.log("\n✅ Example completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Example failed:", error);
      process.exit(1);
    });
}

module.exports = { exampleUsage };
