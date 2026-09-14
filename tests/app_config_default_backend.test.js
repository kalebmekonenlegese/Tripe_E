const fs = require('fs');
const path = require('path');

describe('frontend app config', () => {
  test('uses the local backend as the default API URL', () => {
    const configSource = fs.readFileSync(
      path.join(__dirname, '../assets/config/app-config.js'),
      'utf8'
    );

    expect(configSource).toContain("const defaultApiUrl = 'http://localhost:3000';");
  });
});
