const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

class CsvParser {
  // Parse CSV file and return array of rows
  static async parse(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      let headers = [];
      let rowNumber = 0;
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('headers', (headerList) => {
          headers = headerList;
        })
        .on('data', (data) => {
          rowNumber++;
          // Add row number for tracking
          data._row_number = rowNumber + 1; // +1 because header is row 1
          results.push(data);
        })
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }

  // Validate CSV structure
  static validateStructure(filePath, requiredColumns) {
    return new Promise((resolve, reject) => {
      let headers = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('headers', (headerList) => {
          headers = headerList;
        })
        .on('data', () => {}) // Just read headers
        .on('end', () => {
          const missingColumns = requiredColumns.filter(
            col => !headers.includes(col)
          );

          if (missingColumns.length > 0) {
            resolve({
              valid: false,
              error: `Missing required columns: ${missingColumns.join(', ')}`,
              missingColumns
            });
          } else {
            resolve({
              valid: true,
              headers
            });
          }
        })
        .on('error', (error) => reject(error));
    });
  }

  // Generate error report
  static generateErrorReport(errors, originalFilePath) {
    if (!errors || errors.length === 0) return null;

    // Get all possible headers from errors
    const allHeaders = new Set(['row', 'error']);
    errors.forEach(e => {
      if (e.data) {
        Object.keys(e.data).forEach(key => allHeaders.add(key));
      }
    });

    const headers = Array.from(allHeaders);
    const csvRows = [headers.join(',')];
    
    errors.forEach(e => {
      const row = [];
      headers.forEach(h => {
        if (h === 'row') row.push(e.row);
        else if (h === 'error') row.push(`"${e.error}"`);
        else row.push(`"${e.data?.[h] || ''}"`);
      });
      csvRows.push(row.join(','));
    });

    const errorFileName = `errors-${path.basename(originalFilePath)}`;
    const errorFilePath = path.join(
      path.dirname(originalFilePath),
      errorFileName
    );

    fs.writeFileSync(errorFilePath, csvRows.join('\n'));
    return errorFilePath;
  }

  // Validate a single row based on verification type
  static validateRow(row, verificationType) {
    const requiredFields = {
      pan: ['pan_number', 'name'],
      aadhaar: ['aadhaar_number', 'name'],
      gst: ['gst_number', 'business_name'],
      bank: ['account_number', 'ifsc_code', 'name'],
      education: ['institute', 'degree', 'year', 'student_name'],
      employment: ['employer', 'designation', 'employee_name'],
      court: ['name', 'father_name', 'address'],
      voter: ['voter_id', 'name'],
      driving: ['license_number', 'name']
    };

    const fields = requiredFields[verificationType] || ['name'];
    const missing = fields.filter(f => !row[f] || String(row[f]).trim() === '');
    
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required fields: ${missing.join(', ')}`
      };
    }

    // Format-specific validations
    if (verificationType === 'pan' && row.pan_number) {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(row.pan_number)) {
        return {
          valid: false,
          error: 'Invalid PAN format. Should be 5 letters + 4 numbers + 1 letter (e.g., ABCDE1234F)'
        };
      }
    }

    if (verificationType === 'aadhaar' && row.aadhaar_number) {
      const aadhaarRegex = /^\d{12}$/;
      if (!aadhaarRegex.test(row.aadhaar_number)) {
        return {
          valid: false,
          error: 'Invalid Aadhaar format. Should be 12 digits'
        };
      }
    }

    if (verificationType === 'gst' && row.gst_number) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(row.gst_number)) {
        return {
          valid: false,
          error: 'Invalid GST format'
        };
      }
    }

    return { valid: true };
  }
}

module.exports = CsvParser;
