const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

// Remove the duplicate const authRouter line
const lines = content.split('\n');
let foundFirst = false;
const newLines = lines.filter(line => {
  if (line.includes('const authRouter = require("./routes/auth")')) {
    if (!foundFirst) {
      foundFirst = true;
      return true; // Keep the first one
    }
    return false; // Remove duplicates
  }
  return true;
});

fs.writeFileSync('index.js', newLines.join('\n'));
console.log('Removed duplicate authRouter declarations');
