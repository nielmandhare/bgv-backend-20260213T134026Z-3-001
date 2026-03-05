const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class ExcelParser {
  // Parse Excel file and return array of rows
  static async parse(filePath) {
    return new Promise((resolve, reject) => {
      try {
        // Read the Excel file
        const workbook = XLSX.readFile(filePath);
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const rows = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '' 
        });

        // Extract headers (first row)
        const headers = rows[0] || [];
        
        // Convert remaining rows to objects
        const data = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length === 0 || row.every(cell => !cell)) continue; // Skip empty rows
          
          const rowObj = {};
          headers.forEach((header, index) => {
            if (header) { // Only add if header exists
              rowObj[header.toLowerCase().replace(/\s+/g, '_')] = row[index] || '';
            }
          });
          
          // Add row number for error tracking
          rowObj._row_number = i + 1;
          data.push(rowObj);
        }

        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Parse with specific headers (if file doesn't have headers)
  static async parseWithHeaders(filePath, expectedHeaders) {
    try {
      const workbook = XLSX.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      const data = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0 || row.every(cell => !cell)) continue;
        
        const rowObj = {
          _row_number: i + 1
        };
        
        expectedHeaders.forEach((header, index) => {
          rowObj[header] = row[index] || '';
        });
        
        data.push(rowObj);
      }
      
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Validate Excel file structure
  static validateStructure(filePath, requiredColumns) {
    try {
      const workbook = XLSX.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (rows.length < 2) {
        return {
          valid: false,
          error: 'File must contain header row and at least one data row'
        };
      }

      const headers = rows[0].map(h => String(h).toLowerCase().trim());
      const missingColumns = requiredColumns.filter(
        col => !headers.includes(col.toLowerCase())
      );

      if (missingColumns.length > 0) {
        return {
          valid: false,
          error: `Missing required columns: ${missingColumns.join(', ')}`,
          missingColumns
        };
      }

      return {
        valid: true,
        headers,
        rowCount: rows.length - 1
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = ExcelParser;
