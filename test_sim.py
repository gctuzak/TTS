import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/scripts")
from victron_simulator import encrypt_victron_data, VICTRON_KEY_HEX, MODEL_ID, READOUT_TYPE

try:
    data = encrypt_victron_data(
        VICTRON_KEY_HEX, 
        MODEL_ID, 
        READOUT_TYPE, 
        12.50, -1.25, 85.5, 120, 15.0
    )
    print("Encryption Successful!")
    print(f"Data ({len(data)} bytes): {data.hex()}")
    
    # Prepend E1 02
    full = bytearray([0xE1, 0x02]) + data
    print(f"Full Advertisement ({len(full)} bytes): {full.hex()}")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
