const fs = require('fs');
const path = require('path');

// to run this script, use the following command:
// node cleanupLogs.js

const logDir = path.join(__dirname, '../logs');
const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

fs.readdir(logDir, (err, files) => {
    if (err) return console.error('Error reading log directory:', err);
  
    files.forEach(file => {
      const filePath = path.join(logDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return console.error('Error stating file:', err);
  
        const now = Date.now();
        const age = now - stats.mtimeMs;
        console.log(`File: ${file}, Age (ms): ${age}, Max Age (ms): ${maxAge}`);
        if (age > maxAge) {
          fs.unlink(filePath, err => {
            if (err) return console.error('Error deleting file:', err);
            console.log('Deleted old log file:', file);
          });
        } else {
          console.log('File is not old enough to delete:', file);
        }
      });
    });
  });