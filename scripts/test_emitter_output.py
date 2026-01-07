import subprocess
import time
import signal
import os
import sys

# Kill existing
subprocess.run(["pkill", "-f", "victron_ble_emitter.py"])

print("Starting emitter...")
proc = subprocess.Popen(
    ["/Users/gunaycagrituzak/Desktop/TTS/TTS/venv/bin/python3", "/Users/gunaycagrituzak/Desktop/TTS/TTS/scripts/victron_ble_emitter.py"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

time.sleep(5)
print("Stopping emitter...")
os.kill(proc.pid, signal.SIGTERM)

stdout, stderr = proc.communicate()
print("STDOUT:\n", stdout.decode())
print("STDERR:\n", stderr.decode())
