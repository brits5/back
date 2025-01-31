let currentConfig = {
    user: '',
    password: '',
    server: '',
    database: '',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

const setConfig = (newConfig) => {
    currentConfig = {
        ...currentConfig,
        ...newConfig
    };
};

const getConfig = () => {
    return currentConfig;
};

module.exports = { getConfig, setConfig };