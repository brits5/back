const sql = require('mssql');
const config = require('../config/database');
const { logAudit } = require('../utils/logger');

const checkReferentialIntegrity = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        
        const tablesResult = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `);
        
        const missingConstraints = [];
        
        for (const table of tablesResult.recordset) {
            const columnsResult = await pool.request()
                .input('tableName', sql.VarChar, table.TABLE_NAME)
                .query(`
                    SELECT COLUMN_NAME, DATA_TYPE 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = @tableName
                `);
                
            for (const column of columnsResult.recordset) {
                if (column.COLUMN_NAME.endsWith('_id') || column.COLUMN_NAME.endsWith('Id')) {
                    const fkCheck = await pool.request()
                        .input('tableName', sql.VarChar, table.TABLE_NAME)
                        .input('columnName', sql.VarChar, column.COLUMN_NAME)
                        .query(`
                            SELECT * 
                            FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
                                ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                            WHERE kcu.TABLE_NAME = @tableName 
                                AND kcu.COLUMN_NAME = @columnName
                        `);
                        
                    if (fkCheck.recordset.length === 0) {
                        missingConstraints.push({
                            table: table.TABLE_NAME,
                            column: column.COLUMN_NAME,
                            suggestion: 'Posible clave foránea sin restricción'
                        });
                    }
                }
            }
        }
        
        logAudit('REFERENTIAL_INTEGRITY', `Check completed. Found ${missingConstraints.length} potential issues`);
        res.json({ success: true, missingConstraints });
        
    } catch (err) {
        logAudit('ERROR', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

const checkConstraintAnomalies = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const anomalies = [];
        
        const constraints = await pool.request().query(`
            SELECT 
                fk.name AS FK_Name,
                OBJECT_NAME(fk.parent_object_id) AS TableName,
                COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS ColumnName,
                OBJECT_NAME(fk.referenced_object_id) AS ReferencedTableName,
                fk.delete_referential_action_desc AS DeleteAction,
                fk.update_referential_action_desc AS UpdateAction
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc 
                ON fk.object_id = fkc.constraint_object_id
        `);
        
        for (const constraint of constraints.recordset) {
            if (constraint.DeleteAction === 'NO_ACTION') {
                anomalies.push({
                    type: 'DELETE_ACTION',
                    table: constraint.TableName,
                    constraint: constraint.FK_Name,
                    message: 'Considerar CASCADE o SET NULL para DELETE'
                });
            }
            
            if (constraint.UpdateAction === 'NO_ACTION') {
                anomalies.push({
                    type: 'UPDATE_ACTION',
                    table: constraint.TableName,
                    constraint: constraint.FK_Name,
                    message: 'Considerar CASCADE para UPDATE'
                });
            }
        }
        
        logAudit('CONSTRAINT_ANOMALIES', `Check completed. Found ${anomalies.length} anomalies`);
        res.json({ success: true, anomalies });
        
    } catch (err) {
        logAudit('ERROR', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

const checkDataAnomalies = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const anomalies = [];
        
        // Obtener todas las tablas
        const tablesResult = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' 
            AND TABLE_SCHEMA = 'dbo'
        `);
        
        for (const table of tablesResult.recordset) {
            // Verificar valores nulos en columnas no-nullable
            const nullCheck = await pool.request()
                .input('tableName', sql.VarChar, table.TABLE_NAME)
                .query(`
                    SELECT COLUMN_NAME
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = @tableName
                    AND IS_NULLABLE = 'NO'
                    AND TABLE_SCHEMA = 'dbo'
                `);
                
            for (const column of nullCheck.recordset) {
                const nullCount = await pool.request()
                    .input('tableName', sql.VarChar, table.TABLE_NAME)
                    .input('columnName', sql.VarChar, column.COLUMN_NAME)
                    .query(`
                        SELECT COUNT(*) as nullCount
                        FROM [${table.TABLE_NAME}]
                        WHERE [${column.COLUMN_NAME}] IS NULL
                    `);
                    
                if (nullCount.recordset[0].nullCount > 0) {
                    anomalies.push({
                        type: 'NULL_VALUES',
                        table: table.TABLE_NAME,
                        column: column.COLUMN_NAME,
                        count: nullCount.recordset[0].nullCount
                    });
                }
            }
            
            // Verificar duplicados en columnas únicas
            const uniqueCheck = await pool.request()
                .input('tableName', sql.VarChar, table.TABLE_NAME)
                .query(`
                    SELECT c.COLUMN_NAME
                    FROM INFORMATION_SCHEMA.COLUMNS c
                    INNER JOIN sys.indexes i 
                        ON OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME) = i.object_id
                    INNER JOIN sys.index_columns ic 
                        ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                    WHERE c.TABLE_NAME = @tableName
                    AND i.is_unique = 1
                    AND c.TABLE_SCHEMA = 'dbo'
                `);
                
            for (const column of uniqueCheck.recordset) {
                const duplicates = await pool.request()
                    .input('tableName', sql.VarChar, table.TABLE_NAME)
                    .input('columnName', sql.VarChar, column.COLUMN_NAME)
                    .query(`
                        SELECT [${column.COLUMN_NAME}], COUNT(*) as count
                        FROM [${table.TABLE_NAME}]
                        GROUP BY [${column.COLUMN_NAME}]
                        HAVING COUNT(*) > 1
                    `);
                    
                if (duplicates.recordset.length > 0) {
                    anomalies.push({
                        type: 'DUPLICATES',
                        table: table.TABLE_NAME,
                        column: column.COLUMN_NAME,
                        count: duplicates.recordset.length
                    });
                }
            }
        }
        
        logAudit('DATA_ANOMALIES', `Check completed. Found ${anomalies.length} anomalies`);
        res.json({ success: true, anomalies });
        
    } catch (err) {
        logAudit('ERROR', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

const getLogs = (req, res) => {
    try {
        const logs = fs.readFileSync(path.join(__dirname, '../../audit.log'), 'utf8');
        res.json({ success: true, logs: logs.split('\n') });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const testConnection = async (req, res) => {
    const { server, database, user, password } = req.body;
    
    const testConfig = {
        ...config,
        server,
        database,
        user,
        password
    };
    
    try {
        const pool = await sql.connect(testConfig);
        await pool.close();
        res.json({ success: true, message: 'Conexión exitosa' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    checkReferentialIntegrity,
    checkConstraintAnomalies,
    checkDataAnomalies,
    getLogs,
    testConnection
};