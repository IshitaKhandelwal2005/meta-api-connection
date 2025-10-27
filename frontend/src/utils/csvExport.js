/**
 * Converts an array of objects to a CSV string
 * @param {Array} data - Array of objects to convert to CSV
 * @param {Object} options - Options for CSV generation
 * @param {Array} options.fields - Fields to include in the CSV (default: all fields)
 * @param {Object} options.fieldNames - Custom field names for the CSV header
 * @returns {string} - CSV formatted string
 */
export const jsonToCsv = (data, options = {}) => {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const { fields, fieldNames = {} } = options;
  const headers = fields || Object.keys(data[0]);
  
  // Escape CSV values (handles commas, quotes, and newlines)
  const escapeCsvValue = (value) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    // If value contains comma, quote, or newline, wrap in quotes and escape existing quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  // Create CSV header row
  const headerRow = headers
    .map(field => escapeCsvValue(fieldNames[field] || field))
    .join(',');

  // Create CSV data rows
  const dataRows = data.map(item => {
    return headers
      .map(field => {
        // Handle nested properties (e.g., 'user.name')
        const value = field.split('.').reduce((obj, key) => 
          (obj && obj[key] !== undefined) ? obj[key] : '', item);
        return escapeCsvValue(value);
      })
      .join(',');
  });

  // Combine header and data rows
  return [headerRow, ...dataRows].join('\n');
};

/**
 * Trigends a download of the data as a CSV file
 * @param {string} csvContent - CSV content as a string
 * @param {string} filename - Name of the file to download (without extension)
 */
export const downloadCsv = (csvContent, filename = 'export') => {
  // Create a Blob with the CSV content
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  
  // Create a download link
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  // Set the download attributes
  link.setAttribute('href', url);
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('download', `${filename.replace(/\.csv$/i, '')}-${dateStr}.csv`);
  link.style.visibility = 'hidden';
  
  // Append to body, click and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
