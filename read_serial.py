import serial
import time
import sys

port = '/dev/cu.wchusbserial310'
baud = 115200

print(f"Opening {port} at {baud}...")

try:
    with serial.Serial(port, baud, timeout=1) as ser:
        print("Connected! Reading logs (Ctrl+C to stop)...")
        start_time = time.time()
        while time.time() - start_time < 30: # Read for 30 seconds
            line = ser.readline()
            if line:
                print(line.decode('utf-8', errors='replace').strip())
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
