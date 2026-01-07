import logging
import time
import sys
import os
import objc

# Ensure we can import from the same directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
try:
    from victron_simulator import encrypt_victron_data, VICTRON_KEY_HEX, MODEL_ID, READOUT_TYPE
except ImportError:
    print("Error: Could not import victron_simulator. Make sure it is in the same directory.")
    sys.exit(1)

from PyObjCTools import AppHelper
from CoreBluetooth import (
    CBPeripheralManager,
    CBUUID,
    CBAdvertisementDataLocalNameKey,
    CBAdvertisementDataServiceUUIDsKey,
    CBAdvertisementDataManufacturerDataKey,
    CBAdvertisementDataIsConnectable
)
from Foundation import NSDictionary, NSArray, NSData, NSObject, NSNumber

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VictronEmulator")

class VictronAdvertiser(NSObject):
    def init(self):
        self = objc.super(VictronAdvertiser, self).init()
        if self:
            self.manager = CBPeripheralManager.alloc().initWithDelegate_queue_(self, None)
        return self

    def peripheralManagerDidUpdateState_(self, peripheral):
        state = peripheral.state()
        if state == 5:  # CBManagerStatePoweredOn
            logger.info("Bluetooth ON. Starting Advertising...")
            self.start_advertising()
        else:
            logger.warning(f"Bluetooth state changed: {state}")

    def start_advertising(self):
        # Generate Encrypted Data
        # encrypt_victron_data returns: 
        #   [Prefix(2)] + [Model(2)] + [Readout(1)] + [IV(2)] + [EncryptedBytes(N)]
        # We need to prepend 0xE102 (Victron Manufacturer ID)
        
        # 1. Get raw encrypted payload (starts with 0x10)
        # encrypt_victron_data handles the 0x10 prefix internally if using current logic?
        # Let's check victron_simulator.py logic. Assuming it returns the full Manufacturer Data Payload (excluding Company ID)
        
        encrypted_payload = encrypt_victron_data(VICTRON_KEY_HEX, MODEL_ID, READOUT_TYPE)
        
        # 2. Prepend Victron Company ID (0xE102 -> Little Endian: 0xE1, 0x02)
        # CoreBluetooth expects the whole data in NSData
        full_manuf_data = bytearray([0xE1, 0x02]) + encrypted_payload
        
        data_bytes = bytes(full_manuf_data)
        ns_data = NSData.dataWithBytes_length_(data_bytes, len(data_bytes))
        
        # Manufacturer Data + Local Name + Connectable
        advertisement_data = NSDictionary.dictionaryWithObjects_forKeys_(
            [ns_data, NSNumber.numberWithBool_(True), "V"],
            [CBAdvertisementDataManufacturerDataKey, CBAdvertisementDataIsConnectable, CBAdvertisementDataLocalNameKey]
        )
        
        self.manager.startAdvertising_(advertisement_data)
        logger.info(f"Advertising Started: Victron Encrypted Packet")
        logger.info(f"Full Payload: {full_manuf_data.hex()}")

    def peripheralManagerDidStartAdvertising_error_(self, peripheral, error):
        if error:
            logger.error(f"Error Advertising: {error}")
        else:
            logger.info("Advertising Confirmation Received")

if __name__ == "__main__":
    print("Starting Victron BLE Emitter...", flush=True)
    try:
        app = VictronAdvertiser.alloc().init()
        if app is None:
            print("Failed to initialize VictronAdvertiser", flush=True)
            sys.exit(1)
        
        print("Entering RunLoop...", flush=True)
        AppHelper.runConsoleEventLoop()
    except KeyboardInterrupt:
        print("Stopped by User", flush=True)
    except Exception as e:
        print(f"An error occurred: {e}", flush=True)
        import traceback
        traceback.print_exc()
