const { spawn } = require('child_process');

console.log("Seri porta bağlanılıyor...");

const pio = spawn('/opt/homebrew/bin/pio', ['device', 'monitor', '-p', '/dev/cu.wchusbserial310', '-b', '115200']);

pio.stdout.on('data', (data) => {
  process.stdout.write(data);
});

pio.stderr.on('data', (data) => {
  process.stderr.write(data);
});

setTimeout(() => {
  console.log("\n15 saniye doldu, bağlantı kapatılıyor...");
  pio.kill('SIGINT');
  process.exit(0);
}, 15000);