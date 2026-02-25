// CORS Proxy Handler
const express = require('express');
const request = require('request');

const app = express();
const port = 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.use('/proxy', (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send('URL is required.');
  }

  req.pipe(request(url)).pipe(res);
});

app.listen(port, () => {
  console.log(`CORS Proxy running on http://localhost:${port}`);
});