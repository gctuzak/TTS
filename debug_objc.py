import sys
import os
import objc
from Foundation import NSData, NSDictionary

def debug_nsdata():
    full_manuf_data = bytearray([0xE1, 0x02, 0xAA, 0xBB])
    
    # Method 1: bytearray
    ns_data1 = NSData.dataWithBytes_length_(full_manuf_data, len(full_manuf_data))
    print(f"NSData from bytearray: {ns_data1}")
    
    # Method 2: bytes
    data_bytes = bytes(full_manuf_data)
    ns_data2 = NSData.dataWithBytes_length_(data_bytes, len(data_bytes))
    print(f"NSData from bytes: {ns_data2}")

    # Method 3: dataWithData
    # ns_data3 = NSData.dataWithData_(full_manuf_data) # Might fail if not NSData
    # print(f"NSData from dataWithData: {ns_data3}")

if __name__ == "__main__":
    debug_nsdata()
