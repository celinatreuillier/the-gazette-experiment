// Curated news dataset for The Gazette Experiment
// Loaded directly from experiment_1_data.csv
const fs = require('fs');
const path = require('path');

function parseCSV(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  const articles = [];
  
  // Custom CSV parser handling quoted fields containing commas
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const row = [];
    let insideQuotes = false;
    let currentField = '';

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        row.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row.push(currentField.trim());

    if (row.length >= 7) {
      articles.push({
        id: parseInt(row[0], 10),
        title: row[1],
        header: row[2],
        content: row[3],
        topic: row[4],
        reco_source: row[5],
        explanation: row[6]
      });
    }
  }

  return articles;
}

const csvPath = path.join(__dirname, 'experiment_1_data.csv');
const NEWS_ARTICLES = parseCSV(csvPath);

module.exports = {
  NEWS_ARTICLES,
  parseCSV
};
