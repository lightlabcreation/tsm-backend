const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envExamplePath = path.join(__dirname, '..', 'env.example');
const envPath = path.join(__dirname, '..', '.env');

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists!');
  console.log('If you want to recreate it, delete the existing .env file first.');
  process.exit(0);
}

// Read env.example
if (!fs.existsSync(envExamplePath)) {
  console.error('❌ env.example file not found!');
  process.exit(1);
}

let envContent = fs.readFileSync(envExamplePath, 'utf8');

// Generate a random JWT secret if it's still the default
if (envContent.includes('your-super-secret-jwt-key-change-this-in-production')) {
  const randomSecret = crypto.randomBytes(32).toString('hex');
  envContent = envContent.replace(
    'your-super-secret-jwt-key-change-this-in-production-min-32-characters',
    randomSecret
  );
  console.log('✅ Generated a random JWT_SECRET');
}

// Write .env file
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('✅ .env file created successfully!');
console.log('📝 Location:', envPath);
console.log('\n⚠️  Please review and update the following if needed:');
console.log('   - MONGO_URI: Your MongoDB connection string');
console.log('   - JWT_SECRET: Already generated (you can change it)');
console.log('   - PORT: Default is 5000');
console.log('   - NODE_ENV: Default is development');
console.log('\n🚀 You can now start the server with: npm run dev');

