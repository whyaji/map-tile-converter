const express = require("express");

const { downloadList } = require("../constants/DownloadList.ts");

const router = express.Router();

const formatFolderName = (item) =>
  `${item.estateAbbr}_${item.estateName.replace(/\s+/g, "_")}`;

router.get("/list", (req, res) => {
  try {
    const downloads = downloadList.map((item) => ({
      downloadId: item.downloadId,
      estateName: item.estateName,
      estateAbbr: item.estateAbbr,
      estateId: item.estateId,
      displayName: `${item.estateAbbr} - ${item.estateName}`,
      folderName: formatFolderName(item),
    }));

    res.json({ downloads });
  } catch (error) {
    console.error("Failed to return download list", error);
    res.status(500).json({ error: "Unable to load download list." });
  }
});

module.exports = router;
