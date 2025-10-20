const path = require("path");
const fs = require("fs-extra");
const {
  convertToStandardizedFormat,
  saveStandardizedMetadata,
} = require("./metadataUtils");

/**
 * Convert existing metadata files to standardized format
 */
async function convertExistingMetadata() {
  try {
    console.log("🔄 Starting conversion of existing metadata files...");

    // Define paths
    const resultDir = path.join(__dirname, "../result");
    const metadataDir = path.join(__dirname, "../assets/maps/metadata");

    // Ensure metadata directory exists
    await fs.ensureDir(metadataDir);

    // Find all existing metadata files in result directory
    const resultFiles = await fs.readdir(resultDir);
    const metadataFiles = resultFiles.filter(
      (file) =>
        file.endsWith("_normalized_chunks_metadata.json") ||
        file.endsWith("_chunks_metadata.json")
    );

    console.log(`📁 Found ${metadataFiles.length} metadata files to convert`);

    let convertedCount = 0;
    let errorCount = 0;

    for (const metadataFile of metadataFiles) {
      try {
        const filePath = path.join(resultDir, metadataFile);
        console.log(`\n📄 Processing: ${metadataFile}`);

        // Read existing metadata
        const existingMetadata = JSON.parse(
          await fs.readFile(filePath, "utf8")
        );

        // Convert to standardized format
        const standardizedMetadata = convertToStandardizedFormat(
          existingMetadata,
          existingMetadata.regionMetadata
        );

        // Save standardized metadata
        const standardizedPath = await saveStandardizedMetadata(
          standardizedMetadata,
          metadataDir
        );

        console.log(
          `✅ Converted: ${metadataFile} -> ${path.basename(standardizedPath)}`
        );
        convertedCount++;
      } catch (error) {
        console.error(`❌ Error converting ${metadataFile}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n🎉 Conversion completed!`);
    console.log(`   - Successfully converted: ${convertedCount} files`);
    console.log(`   - Errors: ${errorCount} files`);
    console.log(`   - Standardized metadata saved to: ${metadataDir}`);
  } catch (error) {
    console.error("❌ Error during conversion:", error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  convertExistingMetadata()
    .then(() => {
      console.log("\n✅ Script completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Script failed:", error);
      process.exit(1);
    });
}

module.exports = { convertExistingMetadata };
