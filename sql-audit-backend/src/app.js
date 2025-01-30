const express = require('express');
const cors = require('cors');
const auditRoutes = require('./routes/audit.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', auditRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});