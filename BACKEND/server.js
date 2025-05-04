const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');

const app = express();
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies

app.post('/rule', async (req, res) => {
  const { displayName, dbCreds } = req.body;
  const { username, password, host, port, serviceName } = dbCreds;

  if (!displayName || !username || !password || !host || !port || !serviceName) {
    return res.status(400).json({ status: 'Invalid request: missing parameters' });
  }

  const connectString = `${host}:${port}/${serviceName}`;
  let connection;

  try {
    connection = await oracledb.getConnection({
      user: username,
      password: password,
      connectString,
    });

    const result = await connection.execute(
      `SELECT * FROM SRS_RULES WHERE RULE_NAME = :displayName`,
      [displayName],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({ status: 'Not Configured in DB' });
    }
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ status: 'DB error', error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        console.error('Error closing connection:', closeErr);
      }
    }
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
