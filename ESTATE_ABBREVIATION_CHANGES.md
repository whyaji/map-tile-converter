# Estate DownloadId System Implementation

## Overview

The map tile converter system has been updated to use the `downloadId` field from `DownloadList.ts` instead of generating random UUIDs for chunk folder names and download IDs. This ensures consistent UUIDs for each estate and makes the system more organized and easier to identify which estate chunks belong to.

## Changes Made

### 1. MapGeneratorService.js

- **Added import**: `const { downloadList } = require("../constants/DownloadList.ts");`
- **New method**: `findEstateData(estateName)` - Looks up estate data from DownloadList
- **New method**: `generateDownloadId(estateName)` - Uses downloadId from DownloadList or falls back to random UUID
- **Updated**: `createChunksFromExistingZip()` - Now accepts `estateName` parameter
- **Updated**: `createChunks()` - Now accepts `estateName` parameter
- **Updated**: `generateOfflineMapChunked()` - Uses downloadId from DownloadList for download ID

### 2. Scripts Updated

All chunk creation scripts now pass the estate name to use downloadId from DownloadList:

- **createEstateChunks.js**: Updated to pass `estateName` parameter
- **createNBEChunks.js**: Updated to pass `estateName` parameter
- **createEstateChunksFiltered.js**: Updated to pass `estateName` parameter
- **processNormalizedEstates.js**: Updated to pass `estateName` parameter

### 3. API Routes Updated

- **routes/maps.js**: Updated `/create-chunks-from-zip` endpoint to accept `estateName` parameter

## How It Works

### Before (Random UUID-based)

```
assets/maps/chunks/
└── 54adb675-6cdf-48e9-b1ff-709d8669ceb4/  # Random UUID
    ├── chunk_000.bin
    ├── chunk_001.bin
    └── ...
```

### After (DownloadList UUID-based)

```
assets/maps/chunks/
├── a362012e-64d4-4f0e-b618-be0f416ba8de/  # NATAI BARU ESTATE
│   ├── chunk_000.bin
│   ├── chunk_001.bin
│   └── ...
├── 592f3327-fe1a-418a-af7d-2d7dfa3dc0d2/  # BADIRIH ESTATE
│   ├── chunk_000.bin
│   └── ...
└── 06f062fc-4679-47cc-83b8-3c20a17d2b27/  # KONDANG ESTATE
    ├── chunk_000.bin
    └── ...
```

## Estate DownloadId Mapping

| Estate Name           | Abbreviation | DownloadId                           | Chunk Folder                                               |
| --------------------- | ------------ | ------------------------------------ | ---------------------------------------------------------- |
| KONDANG ESTATE        | KDE          | 06f062fc-4679-47cc-83b8-3c20a17d2b27 | `assets/maps/chunks/06f062fc-4679-47cc-83b8-3c20a17d2b27/` |
| PULAU ESTATE          | PLE          | 1904ad3d-1e14-45e0-bf33-d3246b6362af | `assets/maps/chunks/1904ad3d-1e14-45e0-bf33-d3246b6362af/` |
| NATAI BARU ESTATE     | NBE          | a362012e-64d4-4f0e-b618-be0f416ba8de | `assets/maps/chunks/a362012e-64d4-4f0e-b618-be0f416ba8de/` |
| BADIRIH ESTATE        | BDE          | 592f3327-fe1a-418a-af7d-2d7dfa3dc0d2 | `assets/maps/chunks/592f3327-fe1a-418a-af7d-2d7dfa3dc0d2/` |
| SIMPANG KADIPI ESTATE | SKE          | 1c5a7e55-5ffc-47cb-ac26-1fbb7fefef0f | `assets/maps/chunks/1c5a7e55-5ffc-47cb-ac26-1fbb7fefef0f/` |
| ...                   | ...          | ...                                  | ...                                                        |

## Usage Examples

### Script Usage

```javascript
// Old way (Random UUID)
const chunkResult = await MapGeneratorService.createChunksFromExistingZip(
  zipPath,
  chunkSize
);

// New way (DownloadList UUID)
const chunkResult = await MapGeneratorService.createChunksFromExistingZip(
  zipPath,
  chunkSize,
  "NATAI BARU ESTATE"
);
// Creates chunks in: assets/maps/chunks/a362012e-64d4-4f0e-b618-be0f416ba8de/
```

### API Usage

```bash
curl -X POST http://localhost:3000/api/maps/create-chunks-from-zip \
  -H "Content-Type: application/json" \
  -d '{
    "zipFilePath": "/path/to/estate.zip",
    "chunkSize": 2097152,
    "estateName": "NATAI BARU ESTATE"
  }'
```

## Fallback Behavior

- If `estateName` is provided and found in DownloadList → Uses downloadId from DownloadList
- If `estateName` is provided but not found → Uses random UUID fallback
- If `estateName` is null/undefined → Uses random UUID fallback

## Benefits

1. **Consistent UUIDs**: Each estate always uses the same UUID from DownloadList
2. **Better Organization**: Chunk folders are named with consistent UUIDs
3. **Easier Identification**: Can quickly identify which estate chunks belong to by UUID
4. **Predictable Naming**: Uses the same downloadId as defined in DownloadList.ts
5. **Backward Compatibility**: Falls back to random UUID for unknown estates
6. **No Breaking Changes**: Existing functionality remains intact

## Testing

The system has been tested with:

- Known estates from DownloadList (uses their downloadId)
- Unknown estates (falls back to random UUID)
- Null/undefined estate names (falls back to random UUID)

All tests pass successfully.
