const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');
const NodeCache = require('node-cache');

// Cache setup (TTL: 60 minutes)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

const app = express();
app.use(cors());
app.use(express.json());

app.post('/rule', async (req, res) => {
  const { name, dbCreds } = req.body;
  const { username, password, host, port, serviceName } = dbCreds;

  if (!name || !username || !password || !host || !port || !serviceName) {
    return res.status(400).json({ status: 'Invalid request: missing parameters' });
  }

  // Create cache key based on credentials and rule name
  const cacheKey = `${username}@${host}:${port}/${serviceName}:${name}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    return res.json({ ...cachedData});
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
      `SELECT * FROM SRS_RULES WHERE RULE_NAME = :name`,
      [name],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const response = result.rows.length > 0
      ? result.rows[0]
      : { status: 'Not Configured in DB' };

    // Store in cache
    cache.set(cacheKey, response);

    res.json(response);
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
