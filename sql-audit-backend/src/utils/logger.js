// src/utils/logger.js
const fs = require('fs');
const path = require('path');

const logAudit = (type, message, details = null) => {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${type}: ${message}`;
    
    // Agregar detalles específicos según el tipo de auditoría
    if (details) {
        switch(type) {
            case 'REFERENTIAL_INTEGRITY':
                details.forEach(item => {
                    logEntry += `\n  - Tabla: ${item.table}, Columna: ${item.column}, ${item.suggestion}`;
                });
                break;
                
            case 'CONSTRAINT_ANOMALIES':
                details.forEach(item => {
                    logEntry += `\n  - Tabla: ${item.table}, Restricción: ${item.constraint}, Tipo: ${item.type}, ${item.message}`;
                });
                break;
                
            case 'DATA_ANOMALIES':
                details.forEach(item => {
                    logEntry += `\n  - Tabla: ${item.table}, Columna: ${item.column}, Tipo: ${item.type}, Cantidad: ${item.count}`;
                });
                break;
        }
    }
    
    logEntry += '\n-------------------------------------------\n';
    fs.appendFileSync(path.join(__dirname, '../../audit.log'), logEntry);
};

const getLogs = (req, res) => {
    try {
        const logs = fs.readFileSync(path.join(__dirname, '../../audit.log'), 'utf8');
        // Procesar los logs para mejor formato
        const processedLogs = logs.split('-------------------------------------------')
            .filter(log => log.trim() !== '')
            .map(log => log.trim());
            
        res.json({ 
            success: true, 
            logs: processedLogs,
            totalLogs: processedLogs.length
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = { logAudit, getLogs };