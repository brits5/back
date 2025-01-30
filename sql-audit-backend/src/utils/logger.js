const fs = require('fs');
const path = require('path');

const logAudit = (type, message) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${type}: ${message}\n`;
    fs.appendFileSync(path.join(__dirname, '../../audit.log'), logEntry);
};

module.exports = { logAudit };