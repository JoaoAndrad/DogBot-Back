const app = require('./app');

const PORT = 80;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(
    `Server listening on ${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`
  );
});
