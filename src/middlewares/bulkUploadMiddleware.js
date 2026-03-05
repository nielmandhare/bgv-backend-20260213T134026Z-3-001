const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!req.batchId) {
        return cb(new Error('Batch not created yet'), null);
      }
      
      const uploadDir = path.join(__dirname, '../../uploads', req.batchId);
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

// ========== ENHANCED FILE FILTER ==========
const fileFilter = (req, file, cb) => {
  // Common MIME types for different file formats
  const allowedTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp',
    // PDF
    'application/pdf',
    // CSV - multiple possible MIME types
    'text/csv', 
    'application/csv',
    'application/vnd.ms-excel',  // Excel files and sometimes CSV
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.oasis.opendocument.spreadsheet', // .ods
    'application/octet-stream',  // Some systems send CSV as this
    'text/plain',                 // Plain text files
    'text/x-csv',                 // Another CSV variant
    'application/x-csv',          // Another CSV variant
    'application/excel',          // Another Excel variant
    'application/x-excel',        // Another Excel variant
    'text/x-comma-separated-values', // Another CSV variant
    'text/comma-separated-values'     // Another CSV variant
  ];

  // Also check file extension as backup (more reliable sometimes)
  const fileExt = path.extname(file.originalname).toLowerCase().substring(1);
  const allowedExts = [
    'csv', 'xlsx', 'xls', 'ods',  // Spreadsheets
    'txt',                          // Text files
    'pdf',                          // PDF
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'  // Images
  ];

  // Log what we received (helpful for debugging)
  console.log(`📁 File upload - Name: ${file.originalname}, MIME: ${file.mimetype}, Ext: ${fileExt}`);

  // Check by MIME type first
  if (allowedTypes.includes(file.mimetype)) {
    console.log(`✅ File accepted by MIME type: ${file.mimetype}`);
    return cb(null, true);
  }
  
  // Fallback: check by file extension
  if (allowedExts.includes(fileExt)) {
    console.log(`✅ File accepted by extension: ${fileExt}`);
    return cb(null, true);
  }

  // If we get here, file is not allowed
  console.log(`❌ File rejected - MIME: ${file.mimetype}, Ext: ${fileExt}`);
  
  // Create helpful error message
  const errorMsg = `File type not allowed. Received: ${file.mimetype} (${fileExt}). Allowed: CSV, Excel, PDF, Images (JPG, PNG)`;
  cb(new Error(errorMsg), false);
};

// Configure multer for multiple files
const uploadMultiple = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 100 // Max 100 files
  }
}).array('files', 100);

// Configure multer for single file (CSV/Excel)
const uploadSingle = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB
  }
}).single('file');

// Wrapper for multiple files
const handleMultipleUpload = (req, res, next) => {
  uploadMultiple(req, res, (err) => {
    if (err) {
      console.error('❌ Multer multiple upload error:', err);
      return res.status(400).json({ 
        success: false, 
        error: err.message,
        details: 'Please upload valid files (CSV, Excel, PDF, Images)'
      });
    }
    
    // Log success
    if (req.files && req.files.length > 0) {
      console.log(`✅ Successfully uploaded ${req.files.length} files to batch ${req.batchId}`);
    }
    
    next();
  });
};

// Wrapper for single file
const handleSingleUpload = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      console.error('❌ Multer single upload error:', err);
      return res.status(400).json({ 
        success: false, 
        error: err.message,
        details: 'Please upload a valid CSV or Excel file'
      });
    }
    
    // Log success
    if (req.file) {
      console.log(`✅ Successfully uploaded file: ${req.file.originalname} to batch ${req.batchId}`);
      console.log(`📊 File details - Size: ${req.file.size} bytes, Type: ${req.file.mimetype}`);
    }
    
    next();
  });
};

module.exports = {
  handleMultipleUpload,
  handleSingleUpload
};