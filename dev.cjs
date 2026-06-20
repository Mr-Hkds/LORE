const { spawn } = require('child_process');
const path = require('path');

console.log('Starting LORE Dev Environment (Vite + API Local Server)...');

const server = spawn('node', ['server.cjs'], { stdio: 'inherit', shell: true });
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });

// Handle termination
const cleanExit = () => {
  console.log('\nShutting down dev servers...');
  server.kill();
  vite.kill();
  process.exit();
};

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);
process.on('exit', () => {
  server.kill();
  vite.kill();
});
