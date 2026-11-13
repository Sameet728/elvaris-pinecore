const fs = require('fs');
const path = require('path');

// Let's load candle data from Pine directory
const csvFile = path.join(__dirname, 'XAUUSD_M15.csv');
// If not found, let's check other locations
console.log('Checking CSV file:', fs.existsSync(csvFile));

