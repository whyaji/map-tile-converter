const path = require("path");
const fs = require("fs-extra");
const readline = require("readline");

const { normalizeEstateStructure } = require("./normalizeEstateStructure");
const { processNormalizedEstates } = require("./processNormalizedEstates");

const RAW_DIR = path.resolve(__dirname, "../raw");
const NORMALIZED_DIR = path.resolve(__dirname, "../normalized");
const RESULT_DIR = path.resolve(__dirname, "../result");

async function getAvailableEstates() {
  if (!(await fs.pathExists(RAW_DIR))) {
    return [];
  }

  const entries = await fs.readdir(RAW_DIR);
  const estates = [];

  for (const entry of entries) {
    if (entry === ".DS_Store") continue;

    const fullPath = path.join(RAW_DIR, entry);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      estates.push(entry);
    }
  }

  estates.sort((a, b) => a.localeCompare(b));
  return estates;
}

function promptUserForSelection(estates) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\nSelect an estate to process:");
    estates.forEach((estate, idx) => {
      console.log(`  ${idx + 1}. ${estate}`);
    });
    console.log("  q. Quit");

    const ask = () => {
      rl.question("\nEnter your choice: ", (answer) => {
        const trimmed = answer.trim();

        if (trimmed.toLowerCase() === "q") {
          rl.close();
          resolve(null);
          return;
        }

        const choice = parseInt(trimmed, 10);

        if (Number.isNaN(choice) || choice < 1 || choice > estates.length) {
          console.log("❌ Invalid selection. Please try again.");
          ask();
          return;
        }

        rl.close();
        resolve(estates[choice - 1]);
      });
    };

    ask();
  });
}

async function runWorkflowForEstate(estateName) {
  const estateDir = path.join(RAW_DIR, estateName);
  const normalizedEstateDir = path.join(NORMALIZED_DIR, estateName);
  const outputZipPath = path.join(RESULT_DIR, `${estateName}_normalized.zip`);

  if (!(await fs.pathExists(estateDir))) {
    throw new Error(`Estate directory not found: ${estateDir}`);
  }

  await fs.ensureDir(NORMALIZED_DIR);
  await fs.ensureDir(RESULT_DIR);

  console.log(`\n🚀 Running workflow for ${estateName}...`);

  await normalizeEstateStructure(estateDir, NORMALIZED_DIR, estateName);
  await processNormalizedEstates(
    estateName,
    normalizedEstateDir,
    outputZipPath
  );

  console.log(`\n🎉 Completed workflow for ${estateName}!`);
}

async function main() {
  try {
    const estates = await getAvailableEstates();

    if (estates.length === 0) {
      console.log(
        "⚠️  No estates found in ./raw. Add estate folders to continue."
      );
      return;
    }

    const selectedEstate = await promptUserForSelection(estates);

    if (!selectedEstate) {
      console.log("👋 Operation cancelled.");
      return;
    }

    await runWorkflowForEstate(selectedEstate);
  } catch (error) {
    console.error("❌ Workflow failed:", error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, runWorkflowForEstate };
