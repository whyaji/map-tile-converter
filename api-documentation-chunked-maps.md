# API Documentation - Chunked Map Downloads

Dokumentasi API untuk fitur download map offline dengan sistem chunk yang mendukung pause/resume.

## Overview

Fitur ini memungkinkan download map offline dalam bentuk chunks (potongan-potongan file) yang lebih kecil, sehingga:
- Download dapat di-pause dan di-resume
- Lebih tahan terhadap koneksi internet yang tidak stabil
- Mengurangi risiko kegagalan download untuk file besar
- Progress tracking yang real-time

## Base URL
```
http://localhost:3005/cmpmain
```

## Authentication
Semua endpoint memerlukan authentication header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 1. Generate Chunked Offline Map

Memulai proses generate map offline dengan sistem chunk.

**Endpoint:** `POST /generate-offline-map-chunked`

**Request Body:**
```json
{
  "estate_id": 112,
  "map_type": "satellite",
  "min_zoom": 14,
  "max_zoom": 17,
  "chunk_size": 2097152
}
```

**Parameters:**
- `estate_id` (required): ID estate yang akan di-generate mapnya
- `map_type` (optional): Jenis map - `satellite`, `standard`, `terrain`, `hybrid` (default: `satellite`)
- `min_zoom` (optional): Zoom level minimum (default: 14)
- `max_zoom` (optional): Zoom level maximum (default: 17)
- `chunk_size` (optional): Ukuran maksimal per chunk dalam bytes (default: 2MB = 2097152)

**Response (202 Accepted):**
```json
{
  "success": true,
  "message": "Chunked offline map generation started",
  "data": {
    "estate": {
      "id": 112,
      "abbr": "NBE",
      "name": "NATAI BARU ESTATE"
    },
    "download": {
      "downloadId": "f3242ca1-a9a2-4d30-a68f-cf9163f002fe",
      "status": "PROCESSING",
      "progressUrl": "/api/maps/progress/f3242ca1-a9a2-4d30-a68f-cf9163f002fe",
      "mapType": "satellite",
      "zoomLevels": {
        "min": 14,
        "max": 17
      },
      "chunkSize": "2.0 MB",
      "chunksCount": 0,
      "chunks": []
    }
  }
}
```

---

## 1B. Generate Multiple Chunked Offline Maps

Memulai proses generate map offline dengan sistem chunk untuk multiple estates sekaligus.

**Endpoint:** `POST /generate-multiple-offline-map-chunked`

**Request Body:**
```json
{
  "dept_ids": [
    231, 135, 232, 113, 241, 125, 242, 228,
    103, 102, 235, 136, 229, 128, 124, 112,
    122, 127, 121, 230, 106, 105, 104, 129,
    138, 107, 208, 101, 123, 137, 116, 118
  ],
  "map_type": "satellite",
  "min_zoom": 14,
  "max_zoom": 17,
  "chunk_size": 2097152
}
```

**Alternative Request Body (using estate_ids):**
```json
{
  "estate_ids": [112, 113, 114, 115],
  "map_type": "satellite",
  "min_zoom": 14,
  "max_zoom": 17
}
```

**Parameters:**
- `dept_ids` atau `estate_ids` (required): Array ID estates yang akan di-generate mapnya
- `map_type` (optional): Jenis map - `satellite`, `standard`, `terrain`, `hybrid` (default: `satellite`)
- `min_zoom` (optional): Zoom level minimum (default: 14)
- `max_zoom` (optional): Zoom level maximum (default: 17)
- `chunk_size` (optional): Ukuran maksimal per chunk dalam bytes (default: 2MB = 2097152)

**Response (202 Accepted):**
```json
{
  "success": true,
  "message": "Multiple chunked offline map generation started for 4 estates",
  "data": {
    "batch": {
      "batchId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "status": "PROCESSING",
      "progressUrl": "/api/maps/batch-progress/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "totalEstates": 4,
      "mapType": "satellite",
      "zoomLevels": {
        "min": 14,
        "max": 17
      },
      "chunkSize": "2.0 MB",
      "downloads": []
    },
    "estates": [
      {
        "id": 112,
        "abbr": "NBE",
        "name": "NATAI BARU ESTATE"
      },
      {
        "id": 113,
        "abbr": "SBE",
        "name": "SAWIT BARU ESTATE"
      }
    ],
    "totalRequested": 4,
    "totalFound": 4,
    "totalNotFound": 0,
    "estimatedTimeMinutes": 40
  }
}
```

---

## 2. Get Download Progress

Mendapatkan progress download untuk single estate.

**Endpoint:** `GET /maps/progress/{downloadId}`

**Response:**
```json
{
  "success": true,
  "data": {
    "downloadId": "f3242ca1-a9a2-4d30-a68f-cf9163f002fe",
    "estateName": "NATAI BARU ESTATE",
    "estateAbbr": "NBE",
    "status": "COMPLETED",
    "progress": 100,
    "totalTiles": 1250,
    "downloadedTiles": 1250,
    "failedTiles": 0,
    "totalSize": "15.2 MB",
    "sizeBytesRaw": 15925248,
    "chunkSize": "2.0 MB",
    "chunksCount": 8,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:45:00.000Z",
    "error": null,
    "chunks": [
      {
        "index": 0,
        "filename": "chunk_000.bin",
        "size": "2.0 MB",
        "downloadUrl": "/api/maps/download-chunk/f3242ca1-a9a2-4d30-a68f-cf9163f002fe/0",
        "checksum": "5d41402abc4b2a76b9719d911017c592"
      }
    ]
  }
}
```

---

## 2B. Get Batch Download Progress

Mendapatkan progress download untuk multiple estates batch.

**Endpoint:** `GET /maps/batch-progress/{batchId}`

**Response:**
```json
{
  "success": true,
  "data": {
    "batchId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "PROCESSING",
    "totalEstates": 4,
    "completedEstates": 2,
    "failedEstates": 0,
    "overallProgress": 50,
    "mapType": "satellite",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:45:00.000Z",
    "error": null,
    "downloads": [
      {
        "downloadId": "f3242ca1-a9a2-4d30-a68f-cf9163f002fe",
        "estateName": "NATAI BARU ESTATE",
        "estateAbbr": "NBE",
        "status": "COMPLETED",
        "progress": 100,
        "totalTiles": 1250,
        "downloadedTiles": 1250,
        "totalSize": "15.2 MB",
        "chunksCount": 8,
        "progressUrl": "/api/maps/progress/f3242ca1-a9a2-4d30-a68f-cf9163f002fe",
        "error": null
      },
      {
        "downloadId": "g4353db2-b0c3-5e41-b827-df2345678901",
        "estateName": "SAWIT BARU ESTATE",
        "estateAbbr": "SBE",
        "status": "COMPLETED",
        "progress": 100,
        "totalTiles": 980,
        "downloadedTiles": 980,
        "totalSize": "12.8 MB",
        "chunksCount": 7,
        "progressUrl": "/api/maps/progress/g4353db2-b0c3-5e41-b827-df2345678901",
        "error": null
      },
      {
        "downloadId": "h5464ec3-c1d4-6f52-c938-ef3456789012",
        "estateName": "MAJU ESTATE",
        "estateAbbr": "MJE",
        "status": "DOWNLOADING",
        "progress": 45,
        "totalTiles": 1100,
        "downloadedTiles": 495,
        "totalSize": "0 B",
        "chunksCount": 0,
        "progressUrl": "/api/maps/progress/h5464ec3-c1d4-6f52-c938-ef3456789012",
        "error": null
      },
      {
        "downloadId": null,
        "estateName": "JAYA ESTATE",
        "estateAbbr": "JYE",
        "status": "PENDING",
        "progress": 0,
        "totalTiles": 0,
        "downloadedTiles": 0,
        "totalSize": "0 B",
        "chunksCount": 0,
        "progressUrl": null,
        "error": null
      }
    ]
  }
}
```

**Status Values:**
- `INITIALIZING`: Batch baru dibuat, belum mulai processing
- `PROCESSING`: Sedang memproses estates satu per satu
- `COMPLETED`: Semua estates selesai diproses
- `ERROR`: Terjadi error dalam batch processing

**Individual Download Status:**
- `PENDING`: Belum dimulai
- `DOWNLOADING`: Sedang download tiles
- `CHUNKING`: Sedang membuat chunks
- `COMPLETED`: Selesai dan siap didownload
- `ERROR`: Gagal diproses

---

## 3. Pause Download

Menghentikan sementara proses download.

**Endpoint:** `POST /maps/pause/{downloadId}`

**Response:**
```json
{
  "success": true,
  "message": "Download paused successfully",
  "data": {
    "downloadId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "PAUSED"
  }
}
```

---

## 4. Resume Download

Melanjutkan download yang di-pause.

**Endpoint:** `POST /maps/resume/{downloadId}`

**Response:**
```json
{
  "success": true,
  "message": "Download resumed successfully",
  "data": {
    "downloadId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "DOWNLOADING"
  }
}
```

---

## 5. Cancel Download

Membatalkan download dan menghapus file sementara.

**Endpoint:** `DELETE /maps/cancel/{downloadId}`

**Response:**
```json
{
  "success": true,
  "message": "Download cancelled successfully",
  "data": {
    "downloadId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "CANCELLED"
  }
}
```

---

## 6. Download Chunk

Mendownload satu chunk tertentu.

**Endpoint:** `GET /maps/download-chunk/{downloadId}/{chunkIndex}`

**Response:** Binary file dengan headers:
- `Content-Type`: `application/octet-stream`
- `Content-Disposition`: `attachment; filename="chunk_000.bin"`
- `Content-Length`: `2097152`
- `X-Chunk-Index`: `0`
- `X-Chunk-Checksum`: `5d41402abc4b2a76b9719d911017c592`

---

## 7. List All Downloads

Mendapatkan daftar semua download yang pernah dibuat.

**Endpoint:** `GET /maps/downloads`

**Response:**
```json
{
  "success": true,
  "data": {
    "downloads": [
      {
        "downloadId": "550e8400-e29b-41d4-a716-446655440000",
        "estateName": "NATAI BARU ESTATE",
        "estateAbbr": "NBE",
        "status": "COMPLETED",
        "progress": 100,
        "totalTiles": 12000,
        "downloadedTiles": 12000,
        "totalSize": "150.5 MB",
        "createdAt": "2025-01-20T10:30:00.000Z",
        "updatedAt": "2025-01-20T10:45:00.000Z"
      }
    ],
    "count": 1
  }
}
```

---

## Usage Example - Client Side Implementation

### 1. Start Download
```javascript
const response = await fetch('/cmpmain/generate-offline-map-chunked', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    estate_id: 112,
    chunk_size: 2 * 1024 * 1024 // 2MB chunks
  })
});

const result = await response.json();
const downloadId = result.data.download.downloadId;
```

### 2. Monitor Progress
```javascript
const pollProgress = async (downloadId) => {
  const response = await fetch(`/cmpmain/maps/progress/${downloadId}`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  const data = await response.json();
  const progress = data.data;
  
  console.log(`Progress: ${progress.progress}% (${progress.downloadedTiles}/${progress.totalTiles} tiles)`);
  
  if (progress.status === 'COMPLETED') {
    // Start downloading chunks
    downloadAllChunks(downloadId, progress.chunks);
  } else if (progress.status === 'ERROR') {
    console.error('Download failed:', progress.error);
  } else {
    // Continue polling
    setTimeout(() => pollProgress(downloadId), 2000);
  }
};
```

### 3. Download Chunks
```javascript
const downloadAllChunks = async (downloadId, chunks) => {
  const downloadedChunks = [];
  
  for (const chunk of chunks) {
    try {
      const response = await fetch(chunk.downloadUrl, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      const arrayBuffer = await response.arrayBuffer();
      downloadedChunks.push({
        index: chunk.index,
        data: arrayBuffer,
        checksum: response.headers.get('X-Chunk-Checksum')
      });
      
      console.log(`Downloaded chunk ${chunk.index}/${chunks.length}`);
    } catch (error) {
      console.error(`Failed to download chunk ${chunk.index}:`, error);
      // Implement retry logic here
    }
  }
  
  // Reconstruct the original file
  const fullFile = reconstructFile(downloadedChunks);
  saveFile(fullFile, 'offline_map.zip');
};
```

### 4. Pause/Resume Example
```javascript
// Pause download
const pauseDownload = async (downloadId) => {
  await fetch(`/cmpmain/maps/pause/${downloadId}`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  });
};

// Resume download
const resumeDownload = async (downloadId) => {
  await fetch(`/cmpmain/maps/resume/${downloadId}`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  // Continue monitoring progress
  pollProgress(downloadId);
};
```

---

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Estate ID is required"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Download not found"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Error generating chunked offline map",
  "error": "Detailed error message"
}
```

### Retry Strategy

Untuk handling koneksi yang tidak stabil, implementasikan retry strategy:

```javascript
const downloadChunkWithRetry = async (url, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.arrayBuffer();
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
```

---

## File Structure

Setelah menggunakan API ini, struktur file di server akan menjadi:

```
assets/maps/
├── chunks/
│   └── {downloadId}/
│       ├── chunk_000.bin
│       ├── chunk_001.bin
│       └── chunk_002.bin
├── metadata/
│   └── {downloadId}.json
└── downloads/
    └── (original zip files - optional)
```

---

## Best Practices

1. **Chunk Size**: Gunakan chunk size 1-10MB untuk balance antara performance dan reliability (default: 2MB)
2. **Progress Polling**: Poll progress setiap 2-5 detik, jangan terlalu sering
3. **Error Handling**: Implement retry logic dengan exponential backoff
4. **Storage**: Simpan chunks di temporary storage dan gabungkan setelah semua selesai
5. **Cleanup**: Hapus download yang sudah selesai secara berkala untuk menghemat storage 