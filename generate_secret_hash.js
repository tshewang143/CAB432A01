const crypto = require('crypto');

const username = 'pema';
const clientId = '78mvdr28anlf1ijvinjd5ut3er';
const clientSecret = 'ih55og9q08hqe9ph4f2c0s3j32fisvsrsl605heb3vou3s0sl5p';

const message = username + clientId;
const secretHash = crypto
  .createHmac('sha256', clientSecret)
  .update(message)
  .digest('base64');

console.log('SECRET_HASH:', secretHash);
