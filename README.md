# Map Tile Converter

A comprehensive Express.js application for generating offline map tiles and creating chunked downloads for large map datasets. This system can process any estate map data and create downloadable chunks that can be reconstructed into complete ZIP files.

## Features

- 🌍 **Multiple Map Providers**: Support for OpenStreetMap, ArcGIS, Thunderforest, and more
- 📦 **Chunked Downloads**: Split large map datasets into manageable chunks (default 2MB)
- 🔄 **ZIP Reconstruction**: Reconstruct original ZIP files from chunks
- 📊 **Progress Tracking**: Real-time progress monitoring for downloads
- 🛠️ **Flexible Processing**: Process any estate directory structure
- 🔍 **Integrity Verification**: MD5 checksums for chunk verification
- 📱 **REST API**: Complete REST API for all operations
- 🔧 **Structure Normalization**: Automatically standardizes different estate folder structures to `x-y.png` format

## Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Create necessary directories:

```bash
mkdir -p assets/maps/{downloads,output,chunks,metadata}
```

## Usage with QGIS

### 1. Open QGIS and Add Raster Layer

Layer → Add Layer → Raster → Select ECW file

### 2. Change CRS to EPSG:3857

Click the CRS indicator in the bottom right corner → Select Predefined CRS → Choose EPSG:3857

### 3. Show Toolbox Window

Processing → Toolbox

### 4. Generate XYZ Tiles

Toolbox → Raster tools → Generate XYZ tiles (directory)

### 5. Setting Parameters for Generate XYZ

1. **Extent**: Calculate from layer, select your map layer
2. **Minimum zoom**: 14
3. **Maximum zoom**: 18
4. **DPI**: 300
5. **Tile format**: PNG
6. **Quality**: 100
7. **Metatile size**: 20
8. **Tile width**: 512
9. **Tile height**: 512
10. **Output directory**: Save to map tile folder or directly to the `raw` folder in this project

### 6. Get the Boundary Data

The boundary data should be formatted like this:

```json
{
  "sw_lat": -2.63637729774991,
  "sw_lng": 111.6273246642689969,
  "ne_lat": -2.5662031031622701,
  "ne_lng": 111.703655173249004
}
```

#### If Extent is Already in EPSG:4326

When the extent from layer is already in EPSG:4326 format like this:

```
'EXTENT': '111.829357767,111.846943329,-2.532341709,-2.513431308 [EPSG:4326]'
```

The format is: `sw_lng, ne_lng, sw_lat, ne_lat`

#### If Extent is Not in EPSG:4326

Follow these steps to convert:

1. **Extract extent**: Toolbox → Layer tools → Extract Layer Extent → Set input layer to your map layer → Run
2. **Export to EPSG:4326**: In Layers panel, right-click on extent layer → Export → Save Features As → Select path and filename → Set CRS to EPSG:4326 → OK
3. **Get extent coordinates**: Double-click the new extent layer (or open Properties) → Information → Find the extent data under "Information from Provider":

```
Information from provider

Storage: GPKG
Encoding: UTF-8
Geometry: Polygon (Polygon)
Extent: 111.8293577672099985,-2.5323417093133700 : 111.8469433289100010,-2.5134313078873598
Feature count: 1
```

The extent format is: `sw_lng, sw_lat : ne_lng, ne_lat`

Example: `111.8293577672099985,-2.5323417093133700 : 111.8469433289100010,-2.5134313078873598`

### 7. Create Raw Data Structure in Project

#### Folder Structure

The folder structure in the `raw` directory should be:

```
[ESTATE-NAME-FOLDER]
├── map_regions
│   └── [ESTATE-NAME-FOLDER]
│       ├── 14
│       ├── 15
│       ├── 16
│       ├── 17
│       └── 18
└── regions_metadata.json
```

**Example:**

```
NBE_NATAI_BARU_ESTATE
├── map_regions
│   └── NBE_NATAI_BARU_ESTATE
│       ├── 14
│       ├── 15
│       ├── 16
│       ├── 17
│       └── 18
└── regions_metadata.json
```

#### Create regions_metadata.json

Check the data from `constant/downloadList.ts` and fill the bounds based on the boundary data extent:

```json
{
  "name": "NATAI BARU ESTATE",
  "estateAbbr": "NBE",
  "estateId": 112,
  "mapType": 1,
  "bounds": {
    "sw_lat": -2.63637729774991,
    "sw_lng": 111.6273246642689969,
    "ne_lat": -2.5662031031622701,
    "ne_lng": 111.703655173249004
  },
  "minZoom": 14,
  "maxZoom": 18,
  "path": "map_regions/NBE_NATAI_BARU_ESTATE"
}
```

### 8. Run the Processing Scripts

Example for SYE (Suayap Estate):

Open the terminal and run these commands:

```bash
# 1. Normalize estate structure and compress data
node scripts/normalizeEstateStructure.js ./raw/SYE_SUAYAP_ESTATE ./normalized SYE_SUAYAP_ESTATE

# 2. Process and create chunks
node scripts/processNormalizedEstates.js SYE_SUAYAP_ESTATE ./normalized/SYE_SUAYAP_ESTATE
```

**Done!**

## Usage

### 1. Start the Express Server

```bash
npm start
# or for development
npm run dev
```

The server will start on `http://localhost:3000`

### 2. Process Estate Data

#### Using the Command Line Scripts

##### Basic Estate Processing (`createEstateChunks.js`)

```bash
# Process NBE_ESTATE (default)
node scripts/createEstateChunks.js

# Process any estate
node scripts/createEstateChunks.js <estateName> <estateDir> [outputZip] [chunkSize]

# Examples:
node scripts/createEstateChunks.js BDE_ESTATE ./BDE_ESTATE ./BDE_ESTATE.zip
node scripts/createEstateChunks.js MY_ESTATE ./my_estate_folder ./my_estate.zip 1048576
```

##### Filtered Estate Processing (`createEstateChunksFiltered.js`)

The filtered script processes estate data with zoom level filtering and organized output structure:

```bash
# Basic usage - reads zoom levels from region_metadata.json
node scripts/createEstateChunksFiltered.js <estateName> <estateDir>

# With custom output path
node scripts/createEstateChunksFiltered.js <estateName> <estateDir> [outputZip] [zoomLevels] [chunkSize]

# Examples:
node scripts/createEstateChunksFiltered.js BDE_BADIRIH_ESTATE ./raw/BDE_BADIRIH_ESTATE
node scripts/createEstateChunksFiltered.js NBE_NATAI_BARU_ESTATE ./raw/NBE_NATAI_BARU_ESTATE
node scripts/createEstateChunksFiltered.js MY_ESTATE ./raw/MY_ESTATE ./custom_output.zip "14,15,16,17" 2097152
```

##### Estate Structure Normalization (`normalizeEstateStructure.js`)

The normalization script standardizes different estate folder structures to use a consistent `x-y.png` format:

```bash
# Normalize estate structure
node scripts/normalizeEstateStructure.js <estateDir> <outputDir> <estateName>

# Examples:
node scripts/normalizeEstateStructure.js ./raw/BDE_BADIRIH_ESTATE ./normalized BDE_ESTATE
node scripts/normalizeEstateStructure.js ./raw/NBE_NATAI_BARU_ESTATE ./normalized NBE_ESTATE
```

**Handles Different Structures:**

- **BDE (Flat)**: `13388-8325.png` → `13388-8325.png` (unchanged)
- **NBE (Nested)**: `13275/8311.png` → `13275-8311.png` (converted)

##### Complete Workflow (`processEstateWorkflow.js`)

Process estates from raw data to chunks in one command:

```bash
# Single estate
node scripts/processEstateWorkflow.js <estateName> <rawEstateDir> [outputDir] [zoomLevels] [chunkSize]

# Batch processing
node scripts/processEstateWorkflow.js --batch [outputDir] [zoomLevels] [chunkSize]

# Examples:
node scripts/processEstateWorkflow.js BDE_ESTATE ./raw/BDE_BADIRIH_ESTATE ./output
node scripts/processEstateWorkflow.js --batch ./workflow_output
node scripts/processEstateWorkflow.js --batch ./output "14,15,16" 1048576
```

**Key Features of Filtered Processing:**

- **Automatic Zoom Detection**: Reads `minZoom` and `maxZoom` from `region_metadata.json`
- **Organized Output**: Files are organized in `temp/` and `result/` directories
- **Metadata Generation**: Creates proper `region_metadata.json` with unique IDs
- **Nested Directory Support**: Handles complex estate directory structures
- **File Verification**: Tests ZIP reconstruction to ensure integrity

**Output Structure:**

```
result/
├── {ESTATE_NAME}_filtered.zip                    # Original filtered ZIP
├── {ESTATE_NAME}_filtered_reconstructed.zip      # Test reconstruction
└── {ESTATE_NAME}_filtered_chunks_metadata.json   # Complete metadata

temp/                                             # Temporary files (auto-cleaned)
└── {ESTATE_NAME}_filtered/                       # Processing directory

assets/maps/chunks/                               # Chunk files
└── {downloadId}/                                 # Download-specific chunks
    ├── chunk_000.bin
    ├── chunk_001.bin
    └── ...
```

#### Using the REST API

```bash
# Create chunks from existing ZIP
curl -X POST http://localhost:3000/api/maps/create-chunks-from-zip \
  -H "Content-Type: application/json" \
  -d '{
    "zipFilePath": "/path/to/estate.zip",
    "chunkSize": 2097152
  }'

# Generate new map tiles with chunking
curl -X POST http://localhost:3000/api/maps/generate-chunked \
  -H "Content-Type: application/json" \
  -d '{
    "estateId": 123,
    "estateName": "My Estate",
    "estateAbbr": "ME",
    "bounds": {
      "southwest": {"latitude": -2.7, "longitude": 111.6},
      "northeast": {"latitude": -2.5, "longitude": 111.8}
    },
    "minZoom": 12,
    "maxZoom": 20,
    "mapType": "satellite",
    "chunkSize": 2097152
  }'
```

### 3. Download Chunks

```bash
# Download individual chunks
curl -O http://localhost:3000/api/maps/download-chunk/{downloadId}/{chunkIndex}

# Example:
curl -O http://localhost:3000/api/maps/download-chunk/abc123/0
```

### 4. Reconstruct ZIP from Chunks

```bash
# Using the API
curl -X POST http://localhost:3000/api/maps/reconstruct-zip \
  -H "Content-Type: application/json" \
  -d '{
    "downloadId": "abc123",
    "outputPath": "/path/to/reconstructed.zip"
  }'

# Using the utility script
node scripts/chunkUtils.js reconstruct abc123 ./reconstructed.zip
```

## API Endpoints

### Map Generation

- `POST /api/maps/generate` - Generate offline map (single ZIP)
- `POST /api/maps/generate-chunked` - Generate offline map with chunking
- `POST /api/maps/create-chunks-from-zip` - Create chunks from existing ZIP

### Download Management

- `GET /api/maps/downloads` - List all downloads
- `GET /api/maps/download-info/:downloadId` - Get download details
- `GET /api/maps/progress/:downloadId` - Get download progress
- `GET /api/maps/download/:filename` - Download complete ZIP
- `GET /api/maps/download-chunk/:downloadId/:chunkIndex` - Download chunk

### ZIP Reconstruction

- `POST /api/maps/reconstruct-zip` - Reconstruct ZIP from chunks

### Utilities

- `GET /api/maps/providers` - List available map providers
- `GET /health` - Health check

## Utility Scripts

### Chunk Management (`scripts/chunkUtils.js`)

```bash
# List all chunk sets
node scripts/chunkUtils.js list

# Get chunk set details
node scripts/chunkUtils.js info <downloadId>

# Verify chunk integrity
node scripts/chunkUtils.js verify <downloadId>

# Reconstruct ZIP from chunks
node scripts/chunkUtils.js reconstruct <downloadId> [outputPath]

# Clean up old chunks
node scripts/chunkUtils.js cleanup [days]
```

## Directory Structure

```
map-tile-converter/
├── assets/maps/
│   ├── downloads/          # Complete ZIP files
│   ├── output/            # Temporary processing files
│   ├── chunks/            # Chunk files organized by downloadId
│   └── metadata/          # Progress and metadata files
├── raw/                   # Raw estate data for processing
│   ├── BDE_BADIRIH_ESTATE/
│   │   ├── map_regions/
│   │   └── region_metadata.json
│   └── NBE_NATAI_BARU_ESTATE/
│       ├── map_regions/
│       └── region_metadata.json
├── temp/                  # Temporary processing files (auto-cleaned)
│   └── {ESTATE_NAME}_filtered/
├── result/                # Processed output files
│   ├── {ESTATE_NAME}_filtered.zip
│   ├── {ESTATE_NAME}_filtered_reconstructed.zip
│   └── {ESTATE_NAME}_filtered_chunks_metadata.json
├── services/
│   └── MapGeneratorService.js  # Core map generation logic
├── routes/
│   └── maps.js            # API routes
├── scripts/
│   ├── createEstateChunks.js        # Basic estate processing
│   ├── createEstateChunksFiltered.js # Advanced filtered processing
│   ├── normalizeEstateStructure.js  # Structure normalization
│   ├── processNormalizedEstates.js  # Process normalized estates
│   ├── processEstateWorkflow.js     # Complete workflow
│   └── chunkUtils.js      # Chunk management utilities
├── server.js              # Express server
└── package.json
```

## Configuration

### Map Providers

The system supports multiple map providers defined in `services/MapGeneratorService.js`:

- `standard`: OpenStreetMap
- `satellite`: ArcGIS World Imagery
- `terrain`: Thunderforest Landscape
- `hybrid`: ArcGIS World Street Map

### Chunk Size

Default chunk size is 2MB (2,097,152 bytes). You can customize this when creating chunks:

```javascript
// 1MB chunks
const chunkSize = 1024 * 1024;

// 5MB chunks
const chunkSize = 5 * 1024 * 1024;
```

## Example: Processing Estate Data

### Basic Processing with `createEstateChunks.js`

1. **Prepare the estate directory** with the following structure:

```
NBE_ESTATE/
├── 12/          # Zoom level directories
├── 13/
├── ...
├── 20/
├── metadata.json
└── *.html       # Optional HTML files
```

2. **Create chunks**:

```bash
node scripts/createEstateChunks.js NBE_ESTATE ./NBE_ESTATE
```

3. **Download chunks** (if using API):

```bash
# Get download ID from the script output
curl -O http://localhost:3000/api/maps/download-chunk/{downloadId}/0
curl -O http://localhost:3000/api/maps/download-chunk/{downloadId}/1
# ... continue for all chunks
```

4. **Reconstruct ZIP**:

```bash
node scripts/chunkUtils.js reconstruct {downloadId} ./NBE_ESTATE_reconstructed.zip
```

### Advanced Processing with `createEstateChunksFiltered.js`

This script is designed for processing raw estate data with automatic zoom level filtering and organized output.

#### 1. Prepare Raw Estate Data

Place your estate data in the `raw/` directory with the following structure:

```
raw/
├── BDE_BADIRIH_ESTATE/
│   ├── map_regions/
│   │   └── BDE_BADIRIH_ESTATE/
│   │       ├── 14/              # Zoom level directories
│   │       ├── 15/
│   │       ├── 16/
│   │       ├── 17/
│   │       └── region_metadata.json
│   └── region_metadata.json     # Estate metadata
└── NBE_NATAI_BARU_ESTATE/
    ├── map_regions/
    │   └── NBE_NATAI_BARU_ESTATE/
    │       ├── 14/
    │       ├── 15/
    │       ├── 16/
    │       ├── 17/
    │       └── region_metadata.json
    └── region_metadata.json
```

#### 2. Required Metadata Format

Each estate must have a `region_metadata.json` file with the following structure:

```json
{
  "name": "BADIRIH ESTATE",
  "estateAbbr": "BDE",
  "estateId": 231,
  "mapType": 1,
  "bounds": {
    "sw_lat": -3.07162087,
    "sw_lng": 114.1781424,
    "ne_lat": -2.9264345300000003,
    "ne_lng": 114.31594724
  },
  "minZoom": 14,
  "maxZoom": 17,
  "path": "map_regions/BDE_BADIRIH_ESTATE"
}
```

#### 3. Process Estates

```bash
# Process BDE estate (reads zoom levels 14-17 from metadata)
node scripts/createEstateChunksFiltered.js BDE_ESTATE ./raw/BDE_BADIRIH_ESTATE

# Process NBE estate (reads zoom levels 14-17 from metadata)
node scripts/createEstateChunksFiltered.js NBE_ESTATE ./raw/NBE_NATAI_BARU_ESTATE

# Process with custom zoom levels
node scripts/createEstateChunksFiltered.js MY_ESTATE ./raw/MY_ESTATE ./custom.zip "14,15,16" 1048576
```

#### 4. Output Files

After processing, you'll find organized output in the `result/` directory:

```bash
# Check results
ls -la result/

# Example output:
# BDE_ESTATE_filtered.zip                    # 40.2 MB filtered ZIP
# BDE_ESTATE_filtered_reconstructed.zip      # Test reconstruction
# BDE_ESTATE_filtered_chunks_metadata.json   # Complete metadata
# NBE_ESTATE_filtered.zip                    # 35.1 MB filtered ZIP
# NBE_ESTATE_filtered_reconstructed.zip      # Test reconstruction
# NBE_ESTATE_filtered_chunks_metadata.json   # Complete metadata
```

#### 5. Generated Metadata

The script creates comprehensive metadata including:

```json
{
  "estateName": "BDE_ESTATE",
  "downloadId": "78aa2d8e-8748-4f64-99bd-8cda85e42f49",
  "chunkCount": 21,
  "chunkSize": 2097152,
  "totalSize": 42171855,
  "zoomLevels": [14, 15, 16, 17],
  "totalTiles": 3781,
  "regionMetadata": {
    "id": "estate_231_1760757455449",
    "name": "BADIRIH ESTATE",
    "estateAbbr": "BDE",
    "estateId": 231,
    "dateCreated": "2025-01-18T03:17:35.449Z",
    "tileCount": 3781,
    "sizeInBytes": 42171855
  },
  "chunks": [
    {
      "index": 0,
      "filename": "chunk_000.bin",
      "size": 2097152,
      "checksum": "abc123..."
    }
  ]
}
```

## Error Handling

The system includes comprehensive error handling:

- Invalid parameters return 400 status
- Missing files return 404 status
- Server errors return 500 status
- All errors include descriptive messages

## Performance Considerations

- **Concurrent Downloads**: Limited to 20 concurrent tile downloads to prevent rate limiting
- **Chunk Size**: 2MB default balances download efficiency with memory usage
- **Cleanup**: Temporary files are automatically cleaned up after processing
- **Progress Tracking**: Real-time progress updates for long-running operations

## Troubleshooting

### Common Issues

1. **"Directory not found"**: Ensure the estate directory exists and has the correct structure
2. **"Chunk not found"**: Verify the download ID and chunk index are correct
3. **"ZIP reconstruction failed"**: Check that all chunks are present and not corrupted
4. **"Rate limiting"**: The system includes delays to prevent rate limiting, but you may need to adjust concurrency settings

### Filtered Processing Issues

1. **"No region_metadata.json found"**: Ensure each estate directory has a `region_metadata.json` file with `minZoom` and `maxZoom` properties
2. **"Estate subdirectory not found"**: Check that the `map_regions/{ESTATE_NAME}/` directory structure exists
3. **"None of the requested zoom levels were found"**: Verify that the zoom level directories (14, 15, 16, 17) exist in the estate data
4. **"File size mismatch"**: This indicates a problem during ZIP reconstruction - check that all chunks are intact
5. **"Permission denied"**: Ensure the script has write permissions to create `temp/` and `result/` directories

### Debug Mode

Enable debug logging by setting the environment variable:

```bash
DEBUG=map-tile-converter npm start
```

## Quick Reference

### Filtered Processing Commands

```bash
# Process estate with automatic zoom detection
node scripts/createEstateChunksFiltered.js <ESTATE_NAME> ./raw/<ESTATE_DIR>

# Process with custom parameters
node scripts/createEstateChunksFiltered.js <ESTATE_NAME> ./raw/<ESTATE_DIR> [outputZip] [zoomLevels] [chunkSize]

# Examples:
node scripts/createEstateChunksFiltered.js BDE_ESTATE ./raw/BDE_BADIRIH_ESTATE
node scripts/createEstateChunksFiltered.js NBE_ESTATE ./raw/NBE_NATAI_BARU_ESTATE
node scripts/createEstateChunksFiltered.js MY_ESTATE ./raw/MY_ESTATE ./custom.zip "14,15,16" 1048576
```

### Output Locations

- **Result Files**: `result/{ESTATE_NAME}_filtered.*`
- **Chunk Files**: `assets/maps/chunks/{downloadId}/`
- **Temporary Files**: `temp/{ESTATE_NAME}_filtered/` (auto-cleaned)

### Required Directory Structure

```
raw/
└── {ESTATE_DIR}/
    ├── map_regions/
    │   └── {ESTATE_NAME}/
    │       ├── 14/, 15/, 16/, 17/  # Zoom levels
    │       └── region_metadata.json
    └── region_metadata.json        # Must contain minZoom/maxZoom
```

## Additional Documentation

- **[NORMALIZATION_WORKFLOW.md](NORMALIZATION_WORKFLOW.md)**: Detailed guide for estate structure normalization
- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)**: Complete project overview and features

## License

MIT License - see LICENSE file for details.
