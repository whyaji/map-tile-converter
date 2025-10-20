# Estate Structure Normalization Workflow

This document describes the new normalization workflow that standardizes different estate folder structures to use a consistent `x-y.png` format.

## Problem Statement

The original estate data had two different folder structures:

### BDE_BADIRIH_ESTATE Structure (Flat)

```
raw/BDE_BADIRIH_ESTATE/map_regions/BDE_BADIRIH_ESTATE/14/
├── 13388-8325.png
├── 13388-8326.png
├── 13388-8327.png
└── ...
```

### NBE_NATAI_BARU_ESTATE Structure (Nested)

```
raw/NBE_NATAI_BARU_ESTATE/map_regions/NBE_NATAI_BARU_ESTATE/14/
├── 13275/
│   ├── 8311.png
│   ├── 8310.png
│   └── ...
├── 13274/
│   ├── 8311.png
│   ├── 8310.png
│   └── ...
└── ...
```

## Solution: Normalization Workflow

The new workflow standardizes both structures to use the `x-y.png` format in flat directories:

### Normalized Structure

```
normalized/ESTATE_NAME/map_regions/ESTATE_NAME/14/
├── 13388-8325.png  (BDE - already correct)
├── 13275-8311.png  (NBE - converted from 13275/8311.png)
├── 13274-8310.png  (NBE - converted from 13274/8310.png)
└── ...
```

## Scripts Overview

### 1. `normalizeEstateStructure.js`

**Purpose**: Converts different estate structures to standardized format

**Usage**:

```bash
node scripts/normalizeEstateStructure.js <estateDir> <outputDir> <estateName>
```

**Examples**:

```bash
# Normalize BDE estate
node scripts/normalizeEstateStructure.js ./raw/BDE_BADIRIH_ESTATE ./normalized BDE_ESTATE

# Normalize NBE estate
node scripts/normalizeEstateStructure.js ./raw/NBE_NATAI_BARU_ESTATE ./normalized NBE_ESTATE
```

**Features**:

- Handles both flat (BDE) and nested (NBE) structures
- Converts nested structure to flat `x-y.png` format
- Preserves existing `x-y.png` format
- Updates metadata with normalization info
- Recursively processes all zoom levels

### 2. `processNormalizedEstates.js`

**Purpose**: Processes normalized estates and creates chunks

**Usage**:

```bash
node scripts/processNormalizedEstates.js <estateName> <normalizedEstateDir> [outputZip] [zoomLevels] [chunkSize]
```

**Examples**:

```bash
# Process normalized BDE estate
node scripts/processNormalizedEstates.js BDE_ESTATE ./normalized/BDE_ESTATE

# Process with specific zoom levels
node scripts/processNormalizedEstates.js NBE_ESTATE ./normalized/NBE_ESTATE ./output.zip "14,15,16" 1048576
```

**Features**:

- Works with standardized `x-y.png` format
- Creates ZIP files and chunks
- Supports zoom level filtering
- Generates metadata and verification

### 3. `processEstateWorkflow.js`

**Purpose**: Complete workflow from raw data to chunks

**Usage**:

```bash
# Single estate
node scripts/processEstateWorkflow.js <estateName> <rawEstateDir> [outputDir] [zoomLevels] [chunkSize]

# Batch processing
node scripts/processEstateWorkflow.js --batch [outputDir] [zoomLevels] [chunkSize]
```

**Examples**:

```bash
# Process single estate
node scripts/processEstateWorkflow.js BDE_ESTATE ./raw/BDE_BADIRIH_ESTATE ./output

# Process both estates in batch
node scripts/processEstateWorkflow.js --batch ./workflow_output

# Process with specific zoom levels
node scripts/processEstateWorkflow.js --batch ./output "14,15,16" 2097152
```

**Features**:

- Complete end-to-end workflow
- Normalization + processing in one command
- Batch processing support
- Comprehensive reporting

## File Naming Convention

### Input Formats

- **BDE**: `13388-8325.png` (already correct)
- **NBE**: `13275/8311.png` (nested structure)

### Output Format

- **Standardized**: `x-y.png` (flat structure)
- **BDE**: `13388-8325.png` (unchanged)
- **NBE**: `13275-8311.png` (converted from nested)

## Workflow Steps

### Step 1: Normalization

1. Read estate directory structure
2. Identify estate subdirectory in `map_regions`
3. Process each zoom level:
   - For flat structure (BDE): Copy files as-is
   - For nested structure (NBE): Convert `parent/child.png` to `parent-child.png`
4. Update metadata with normalization info
5. Create standardized directory structure

### Step 2: Processing

1. Read normalized estate structure
2. Filter by requested zoom levels
3. Create temporary filtered directory
4. Generate ZIP file
5. Create chunks from ZIP
6. Test reconstruction
7. Generate metadata and reports

### Step 3: Reporting

1. Create summary report
2. Generate metadata files
3. Verify file integrity
4. Clean up temporary files

## Output Structure

```
workflow_output/
├── normalized/
│   ├── BDE_ESTATE/
│   │   ├── region_metadata.json
│   │   └── map_regions/
│   │       └── BDE_ESTATE/
│   │           ├── 14/
│   │           │   ├── 13388-8325.png
│   │           │   └── ...
│   │           └── 15/
│   └── NBE_ESTATE/
│       ├── region_metadata.json
│       └── map_regions/
│           └── NBE_ESTATE/
│               ├── 14/
│               │   ├── 13275-8311.png
│               │   └── ...
│               └── 15/
├── result/
│   ├── BDE_ESTATE_workflow_summary.json
│   └── NBE_ESTATE_workflow_summary.json
└── assets/maps/
    ├── downloads/
    ├── chunks/
    └── metadata/
```

## Benefits

1. **Consistency**: All estates use the same `x-y.png` format
2. **Simplicity**: Flat directory structure is easier to process
3. **Compatibility**: Works with existing chunking and processing scripts
4. **Flexibility**: Handles different input formats automatically
5. **Traceability**: Maintains metadata about normalization process

## Usage Examples

### Quick Start

```bash
# Normalize and process both estates
node scripts/processEstateWorkflow.js --batch ./output
```

### Custom Processing

```bash
# Process specific zoom levels
node scripts/processEstateWorkflow.js BDE_ESTATE ./raw/BDE_BADIRIH_ESTATE ./output "14,15,16" 1048576
```

### Step-by-Step

```bash
# Step 1: Normalize
node scripts/normalizeEstateStructure.js ./raw/BDE_BADIRIH_ESTATE ./normalized BDE_ESTATE

# Step 2: Process
node scripts/processNormalizedEstates.js BDE_ESTATE ./normalized/BDE_ESTATE
```

## Error Handling

- **Missing directories**: Scripts check for required directories and provide clear error messages
- **File conflicts**: Normalization handles filename conflicts by preserving existing `x-y.png` format
- **Metadata issues**: Scripts fall back to default values if metadata is missing
- **Chunk verification**: All chunks are verified for integrity before completion

## Performance

- **BDE_ESTATE**: 3,781 tiles, 39.89 MB → 21 chunks
- **NBE_ESTATE**: 38,286 tiles, 1.7 GB → 857 chunks (full) or 701 tiles, 34.95 MB → 18 chunks (filtered)

## Integration

The normalized structure is compatible with:

- Existing chunking scripts
- Map generation services
- REST API endpoints
- Download and reconstruction systems

All existing functionality continues to work with the standardized format.
