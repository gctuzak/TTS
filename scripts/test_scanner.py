import asyncio
from bleak import BleakScanner

async def run():
    print("Scanning...")
    devices = await BleakScanner.discover(timeout=5.0, return_adv=True)
    for key, (d, adv) in devices.items():
        print(f"Device: {d.address}, Name: {d.name}, RSSI: {adv.rssi}")
        if adv.manufacturer_data:
            for k, v in adv.manufacturer_data.items():
                print(f"  Manuf: {k:04x} -> {v.hex()}")

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
loop.run_until_complete(run())
