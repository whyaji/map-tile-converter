const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const path = require("path");
const fs = require("fs-extra");

// Import the map generator service
const MapGeneratorService = require("./services/MapGeneratorService");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const shouldCompress = (req, res) => {
  if (req.path === "/api/workflow/stream") {
    return false;
  }
  return compression.filter(req, res);
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression({ filter: shouldCompress }));
app.use(morgan("combined"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static assets
app.use(express.static(PUBLIC_DIR));
app.use("/downloads", express.static(path.join(__dirname, "downloads")));
app.use("/chunks", express.static(path.join(__dirname, "chunks")));

// Routes
app.use("/api/maps", require("./routes/maps"));
app.use("/api/downloads", require("./routes/downloads"));
app.use("/api/raw", require("./routes/raw"));
app.use("/api/workflow", require("./routes/workflow"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Root endpoint (serve dashboard when available)
app.get("/", async (req, res, next) => {
  try {
    const dashboardPath = path.join(PUBLIC_DIR, "index.html");
    if (await fs.pathExists(dashboardPath)) {
      return res.sendFile(dashboardPath);
    }
    return res.json({
      message: "Map Tile Converter API",
      version: "1.0.0",
      endpoints: {
        health: "/health",
        maps: "/api/maps",
        workflow: "/api/workflow",
      },
    });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Map Tile Converter API running on port ${PORT}`);
  console.log(`📁 Downloads directory: ${path.join(__dirname, "downloads")}`);
  console.log(`📦 Chunks directory: ${path.join(__dirname, "chunks")}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
