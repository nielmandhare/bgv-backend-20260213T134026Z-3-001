const pool = require("../db/db");
const { v4: uuidv4 } = require("uuid");

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    const file = req.file;

    const docId = uuidv4();

    await pool.query(
      `INSERT INTO documents
       (id, original_name, file_name, file_path, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        docId,
        file.originalname,
        file.filename,
        file.path,
        file.size,
        file.mimetype
      ]
    );

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        documentId: docId,
        fileName: file.originalname
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
