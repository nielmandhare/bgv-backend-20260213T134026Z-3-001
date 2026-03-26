console.log("✅ UPLOAD ROUTES LOADED");
console.log("✅ Upload routes file loaded");

const express = require("express");
const router = express.Router();
const upload = require("../config/multerConfig");
const { uploadFile } = require("../controllers/uploadController");

router.post("/", upload.single("file"), uploadFile);   // ✅ FIXED

module.exports = router;
