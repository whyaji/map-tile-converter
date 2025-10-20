const fs = require("fs-extra");
const path = require("path");
const MapGeneratorService = require("../services/MapGeneratorService");

async function runTests() {
  console.log("🧪 Running Map Tile Converter Tests");
  console.log("====================================\n");

  let passed = 0;
  let failed = 0;

  function test(name, testFn) {
    return async () => {
      try {
        console.log(`Testing: ${name}`);
        await testFn();
        console.log(`✅ PASSED: ${name}\n`);
        passed++;
      } catch (error) {
        console.log(`❌ FAILED: ${name}`);
        console.log(`   Error: ${error.message}\n`);
        failed++;
      }
    };
  }

  // Test 1: Service initialization
  await test("Service initialization", async () => {
    if (!MapGeneratorService) {
      throw new Error("MapGeneratorService not loaded");
    }
  });

  // Test 2: Directory creation
  await test("Directory creation", async () => {
    const testDir = path.join(__dirname, "../test_temp");
    await fs.ensureDir(testDir);

    if (!(await fs.pathExists(testDir))) {
      throw new Error("Directory not created");
    }

    await fs.remove(testDir);
  });

  // Test 3: ZIP file creation from existing directory
  await test("ZIP creation from NBE_ESTATE", async () => {
    const nbeDir = path.join(__dirname, "../NBE_ESTATE");

    if (!(await fs.pathExists(nbeDir))) {
      throw new Error("NBE_ESTATE directory not found");
    }

    const outputZip = path.join(__dirname, "../test_nbe.zip");

    // Create ZIP using archiver
    const archiver = require("archiver");
    const output = fs.createWriteStream(outputZip);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(nbeDir, "NBE_ESTATE");

    await new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.finalize();
    });

    if (!(await fs.pathExists(outputZip))) {
      throw new Error("ZIP file not created");
    }

    const stats = await fs.stat(outputZip);
    if (stats.size === 0) {
      throw new Error("ZIP file is empty");
    }

    // Cleanup
    await fs.remove(outputZip);
  });

  // Test 4: Chunk creation from ZIP
  await test("Chunk creation from ZIP", async () => {
    const nbeDir = path.join(__dirname, "../NBE_ESTATE");

    if (!(await fs.pathExists(nbeDir))) {
      throw new Error("NBE_ESTATE directory not found");
    }

    // Create a test ZIP first
    const testZip = path.join(__dirname, "../test_chunks.zip");
    const archiver = require("archiver");
    const output = fs.createWriteStream(testZip);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(nbeDir, "NBE_ESTATE");

    await new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.finalize();
    });

    // Create chunks from the ZIP
    const chunkResult = await MapGeneratorService.createChunksFromExistingZip(
      testZip,
      1024 * 1024
    ); // 1MB chunks

    if (!chunkResult.downloadId) {
      throw new Error("No download ID generated");
    }

    if (chunkResult.chunks.length === 0) {
      throw new Error("No chunks created");
    }

    // Test chunk file existence
    const chunkDir = path.join(
      __dirname,
      "../assets/maps/chunks",
      chunkResult.downloadId
    );
    if (!(await fs.pathExists(chunkDir))) {
      throw new Error("Chunk directory not created");
    }

    // Cleanup
    await fs.remove(testZip);
    await fs.remove(chunkDir);
  });

  // Test 5: ZIP reconstruction from chunks
  await test("ZIP reconstruction from chunks", async () => {
    const nbeDir = path.join(__dirname, "../NBE_ESTATE");

    if (!(await fs.pathExists(nbeDir))) {
      throw new Error("NBE_ESTATE directory not found");
    }

    // Create test ZIP
    const testZip = path.join(__dirname, "../test_reconstruct.zip");
    const archiver = require("archiver");
    const output = fs.createWriteStream(testZip);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(nbeDir, "NBE_ESTATE");

    await new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.finalize();
    });

    // Create chunks
    const chunkResult = await MapGeneratorService.createChunksFromExistingZip(
      testZip,
      1024 * 1024
    );

    // Reconstruct ZIP
    const reconstructedZip = path.join(__dirname, "../test_reconstructed.zip");
    const reconstruction = await MapGeneratorService.reconstructZipFromChunks(
      chunkResult.downloadId,
      reconstructedZip
    );

    if (!(await fs.pathExists(reconstructedZip))) {
      throw new Error("Reconstructed ZIP not created");
    }

    // Verify file sizes match
    const originalStats = await fs.stat(testZip);
    const reconstructedStats = await fs.stat(reconstructedZip);

    if (originalStats.size !== reconstructedStats.size) {
      throw new Error(
        `Size mismatch: original ${originalStats.size}, reconstructed ${reconstructedStats.size}`
      );
    }

    // Cleanup
    await fs.remove(testZip);
    await fs.remove(reconstructedZip);
    await fs.remove(
      path.join(__dirname, "../assets/maps/chunks", chunkResult.downloadId)
    );
  });

  // Test 6: API endpoints (basic check)
  await test("API endpoint availability", async () => {
    const express = require("express");
    const app = express();

    // Import routes
    const mapsRouter = require("../routes/maps");
    app.use("/api/maps", mapsRouter);

    // This is a basic check that the routes can be loaded
    if (!mapsRouter) {
      throw new Error("Maps router not loaded");
    }
  });

  // Summary
  console.log("📊 Test Results");
  console.log("===============");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(
    `📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`
  );

  if (failed > 0) {
    console.log("\n⚠️  Some tests failed. Please check the errors above.");
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed!");
    process.exit(0);
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = runTests;
