const http = require('http');

const data = JSON.stringify({
  phone_number: '9999999999',
  otp: '123456'
});

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/v1/auth/verify-otp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log(`ResponseStatus: ${res.statusCode}\nBody: ${body}`));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
