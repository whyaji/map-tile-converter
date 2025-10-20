const path = require("path");
const fs = require("fs-extra");
const MapGeneratorService = require("../services/MapGeneratorService");

class ChunkUtils {
  /**
   * List all available chunk sets
   */
  static async listChunkSets() {
    try {
      const chunksPath = path.join(__dirname, "../assets/maps/chunks");

      if (!(await fs.pathExists(chunksPath))) {
        console.log("No chunks directory found");
        return [];
      }

      const chunkSets = [];
      const dirs = await fs.readdir(chunksPath);

      for (const dir of dirs) {
        const chunkDir = path.join(chunksPath, dir);
        const stats = await fs.stat(chunkDir);

        if (stats.isDirectory()) {
          const files = await fs.readdir(chunkDir);
          const chunkFiles = files.filter(
            (file) => file.startsWith("chunk_") && file.endsWith(".bin")
          );

          if (chunkFiles.length > 0) {
            // Get total size
            let totalSize = 0;
            for (const file of chunkFiles) {
              const filePath = path.join(chunkDir, file);
              const fileStats = await fs.stat(filePath);
              totalSize += fileStats.size;
            }

            chunkSets.push({
              downloadId: dir,
              chunkCount: chunkFiles.length,
              totalSize,
              createdAt: stats.birthtime,
              modifiedAt: stats.mtime,
            });
          }
        }
      }

      return chunkSets.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    } catch (error) {
      console.error("Error listing chunk sets:", error);
      return [];
    }
  }

  /**
   * Get chunk set details
   */
  static async getChunkSetDetails(downloadId) {
    try {
      const chunkDir = path.join(
        __dirname,
        "../assets/maps/chunks",
        downloadId
      );

      if (!(await fs.pathExists(chunkDir))) {
        throw new Error(`Chunk set not found: ${downloadId}`);
      }

      const files = await fs.readdir(chunkDir);
      const chunkFiles = files
        .filter((file) => file.startsWith("chunk_") && file.endsWith(".bin"))
        .sort((a, b) => {
          const aIndex = parseInt(a.match(/chunk_(\d+)\.bin/)[1]);
          const bIndex = parseInt(b.match(/chunk_(\d+)\.bin/)[1]);
          return aIndex - bIndex;
        });

      const chunks = [];
      let totalSize = 0;

      for (const file of chunkFiles) {
        const filePath = path.join(chunkDir, file);
        const stats = await fs.stat(filePath);
        const data = await fs.readFile(filePath);
        const checksum = require("crypto")
          .createHash("md5")
          .update(data)
          .digest("hex");

        chunks.push({
          filename: file,
          size: stats.size,
          checksum,
          modifiedAt: stats.mtime,
        });

        totalSize += stats.size;
      }

      return {
        downloadId,
        chunkCount: chunks.length,
        totalSize,
        chunks,
      };
    } catch (error) {
      console.error("Error getting chunk set details:", error);
      throw error;
    }
  }

  /**
   * Verify chunk integrity
   */
  static async verifyChunkIntegrity(downloadId) {
    try {
      const details = await this.getChunkSetDetails(downloadId);
      const { chunks } = details;

      console.log(`Verifying integrity for ${downloadId}...`);
      console.log(`Total chunks: ${chunks.length}`);

      let validChunks = 0;
      let invalidChunks = 0;

      for (const chunk of chunks) {
        const chunkPath = path.join(
          __dirname,
          "../assets/maps/chunks",
          downloadId,
          chunk.filename
        );
        const data = await fs.readFile(chunkPath);
        const currentChecksum = require("crypto")
          .createHash("md5")
          .update(data)
          .digest("hex");

        if (currentChecksum === chunk.checksum) {
          validChunks++;
        } else {
          invalidChunks++;
          console.warn(`❌ Invalid chunk: ${chunk.filename}`);
        }
      }

      const result = {
        downloadId,
        totalChunks: chunks.length,
        validChunks,
        invalidChunks,
        isValid: invalidChunks === 0,
      };

      console.log(`✅ Valid chunks: ${validChunks}`);
      console.log(`❌ Invalid chunks: ${invalidChunks}`);
      console.log(`Status: ${result.isValid ? "VALID" : "INVALID"}`);

      return result;
    } catch (error) {
      console.error("Error verifying chunk integrity:", error);
      throw error;
    }
  }

  /**
   * Reconstruct ZIP from chunks
   */
  static async reconstructZip(downloadId, outputPath) {
    try {
      console.log(`Reconstructing ZIP from chunks: ${downloadId}`);
      console.log(`Output path: ${outputPath}`);

      const result = await MapGeneratorService.reconstructZipFromChunks(
        downloadId,
        outputPath
      );

      console.log("✅ ZIP reconstruction completed!");
      console.log(`📦 Output file: ${result.outputPath}`);
      console.log(`📊 File size: ${result.size} bytes`);
      console.log(`🔢 Chunks used: ${result.chunksUsed}`);

      return result;
    } catch (error) {
      console.error("Error reconstructing ZIP:", error);
      throw error;
    }
  }

  /**
   * Clean up old chunk sets
   */
  static async cleanupOldChunks(olderThanDays = 30) {
    try {
      const chunkSets = await this.listChunkSets();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const oldChunkSets = chunkSets.filter(
        (set) => new Date(set.createdAt) < cutoffDate
      );

      console.log(
        `Found ${oldChunkSets.length} chunk sets older than ${olderThanDays} days`
      );

      for (const chunkSet of oldChunkSets) {
        const chunkDir = path.join(
          __dirname,
          "../assets/maps/chunks",
          chunkSet.downloadId
        );
        await fs.remove(chunkDir);
        console.log(`🗑️  Removed old chunk set: ${chunkSet.downloadId}`);
      }

      return {
        removed: oldChunkSets.length,
        remaining: chunkSets.length - oldChunkSets.length,
      };
    } catch (error) {
      console.error("Error cleaning up old chunks:", error);
      throw error;
    }
  }

  /**
   * Display chunk set information
   */
  static async displayChunkSetInfo(downloadId) {
    try {
      const details = await this.getChunkSetDetails(downloadId);

      console.log("\n📊 Chunk Set Information");
      console.log("========================");
      console.log(`Download ID: ${details.downloadId}`);
      console.log(`Chunk Count: ${details.chunkCount}`);
      console.log(`Total Size: ${this.formatSize(details.totalSize)}`);
      console.log("\nChunk Details:");
      console.log("Index | Filename        | Size      | Checksum");
      console.log(
        "------|-----------------|-----------|----------------------------------"
      );

      details.chunks.forEach((chunk, index) => {
        const size = this.formatSize(chunk.size);
        console.log(
          `${index.toString().padStart(5)} | ${chunk.filename.padEnd(
            15
          )} | ${size.padStart(9)} | ${chunk.checksum}`
        );
      });

      return details;
    } catch (error) {
      console.error("Error displaying chunk set info:", error);
      throw error;
    }
  }

  /**
   * Format file size
   */
  static formatSize(bytes) {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case "list":
      ChunkUtils.listChunkSets()
        .then((sets) => {
          console.log("\n📦 Available Chunk Sets");
          console.log("========================");
          if (sets.length === 0) {
            console.log("No chunk sets found");
          } else {
            sets.forEach((set) => {
              console.log(
                `${set.downloadId} | ${
                  set.chunkCount
                } chunks | ${ChunkUtils.formatSize(
                  set.totalSize
                )} | ${set.createdAt.toISOString()}`
              );
            });
          }
        })
        .catch(console.error);
      break;

    case "info":
      if (!arg) {
        console.error("Usage: node chunkUtils.js info <downloadId>");
        process.exit(1);
      }
      ChunkUtils.displayChunkSetInfo(arg).catch(console.error);
      break;

    case "verify":
      if (!arg) {
        console.error("Usage: node chunkUtils.js verify <downloadId>");
        process.exit(1);
      }
      ChunkUtils.verifyChunkIntegrity(arg).catch(console.error);
      break;

    case "reconstruct":
      if (!arg) {
        console.error(
          "Usage: node chunkUtils.js reconstruct <downloadId> [outputPath]"
        );
        process.exit(1);
      }
      const outputPath = process.argv[4] || `./reconstructed_${arg}.zip`;
      ChunkUtils.reconstructZip(arg, outputPath).catch(console.error);
      break;

    case "cleanup":
      const days = parseInt(arg) || 30;
      ChunkUtils.cleanupOldChunks(days)
        .then((result) => {
          console.log(
            `✅ Cleanup completed: ${result.removed} removed, ${result.remaining} remaining`
          );
        })
        .catch(console.error);
      break;

    default:
      console.log("ChunkUtils CLI");
      console.log("==============");
      console.log("Commands:");
      console.log("  list                    - List all chunk sets");
      console.log("  info <downloadId>       - Show chunk set details");
      console.log("  verify <downloadId>     - Verify chunk integrity");
      console.log(
        "  reconstruct <downloadId> [outputPath] - Reconstruct ZIP from chunks"
      );
      console.log(
        "  cleanup [days]          - Remove old chunk sets (default: 30 days)"
      );
      break;
  }
}

module.exports = ChunkUtils;
