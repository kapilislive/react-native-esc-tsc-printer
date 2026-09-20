#import <EscTscPrinterSpec/EscTscPrinterSpec.h>
#import <CoreBluetooth/CoreBluetooth.h>

@interface EscTscPrinter : NativeEscTscPrinterSpecBase <NativeEscTscPrinterSpec, CBCentralManagerDelegate, CBPeripheralDelegate>

@end
