import sys
import os
import objc
from CoreBluetooth import CBAdvertisementDataManufacturerDataKey, CBAdvertisementDataLocalNameKey

def debug_keys():
    print(f"Manuf Key: {CBAdvertisementDataManufacturerDataKey}")
    print(f"Name Key: {CBAdvertisementDataLocalNameKey}")

if __name__ == "__main__":
    debug_keys()
