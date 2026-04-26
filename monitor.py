import subprocess
import time

print("Connecting to serial monitor via PIO...")
p = subprocess.Popen(
    ['/opt/homebrew/bin/pio', 'device', 'monitor', '-p', '/dev/cu.wchusbserial310', '-b', '115200'],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)

# wait for 15 seconds to gather logs
time.sleep(15)
p.kill()

stdout, _ = p.communicate()
print("--- LOGS ---")
print(stdout)
print("------------")