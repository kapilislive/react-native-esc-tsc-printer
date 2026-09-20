#import "EscTscPrinter.h"
#import "ImageRaster.h"

static const NSUInteger kBleChunkSize = 182;
static const NSTimeInterval kWritePause = 0.02;

@implementation EscTscPrinter {
  CBCentralManager *_central;
  CBPeripheral *_peripheral;
  CBCharacteristic *_writeCharacteristic;
  NSMutableDictionary<NSString *, NSDictionary *> *_devices;
  NSMutableDictionary<NSString *, CBPeripheral *> *_peripherals;
  NSMutableArray<NSData *> *_pendingChunks;
  RCTPromiseResolveBlock _scanResolve;
  RCTPromiseRejectBlock _scanReject;
  RCTPromiseResolveBlock _connectResolve;
  RCTPromiseRejectBlock _connectReject;
  RCTPromiseResolveBlock _writeResolve;
  RCTPromiseRejectBlock _writeReject;
  RCTPromiseResolveBlock _stateResolve;
  NSInteger _pendingServices;
  BOOL _scanning;
  BOOL _readyForWrite;
}

- (instancetype)init
{
  if (self = [super init]) {
    _devices = [NSMutableDictionary new];
    _peripherals = [NSMutableDictionary new];
    _pendingChunks = [NSMutableArray new];
    _central = [[CBCentralManager alloc] initWithDelegate:self queue:dispatch_get_main_queue()];
    _readyForWrite = YES;
  }
  return self;
}

+ (NSString *)moduleName
{
  return @"EscTscPrinter";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
  (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeEscTscPrinterSpecJSI>(params);
}

- (NSDictionary *)deviceDict:(CBPeripheral *)peripheral
{
  NSString *identifier = peripheral.identifier.UUIDString;
  return @{
    @"id": identifier,
    @"name": peripheral.name ?: @"Unknown",
    @"address": identifier,
    @"type": @"ble"
  };
}

- (NSDictionary *)emptyDevice
{
  return @{
    @"id": @"",
    @"name": @"",
    @"address": @"",
    @"type": @"ble"
  };
}

- (NSDictionary *)emptyEvent
{
  return @{ @"ok": @YES };
}

- (void)waitForPoweredOn:(RCTPromiseResolveBlock)resolve
{
  if (_central.state != CBManagerStateUnknown && _central.state != CBManagerStateResetting) {
    resolve(@(_central.state == CBManagerStatePoweredOn));
    return;
  }
  _stateResolve = resolve;
}

- (void)isEnabled:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self waitForPoweredOn:resolve];
}

- (void)requestPermissions:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self waitForPoweredOn:resolve];
}

- (void)enableBluetooth:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self waitForPoweredOn:resolve];
}

- (void)scan:(double)timeoutMs resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  if (_central.state != CBManagerStatePoweredOn) {
    reject(@"BT_DISABLED", @"Bluetooth is not enabled", nil);
    return;
  }
  if (_scanning) {
    reject(@"SCAN_IN_PROGRESS", @"A scan is already running", nil);
    return;
  }

  [_devices removeAllObjects];
  [_peripherals removeAllObjects];
  _scanResolve = resolve;
  _scanReject = reject;
  _scanning = YES;
  [_central scanForPeripheralsWithServices:nil options:@{ CBCentralManagerScanOptionAllowDuplicatesKey: @NO }];

  NSTimeInterval timeout = MAX(timeoutMs / 1000.0, 1.0);
  __weak typeof(self) weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeout * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    [weakSelf finishScan];
  });
}

- (void)stopScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self finishScan];
  resolve(nil);
}

- (void)finishScan
{
  if (!_scanning) {
    return;
  }
  _scanning = NO;
  [_central stopScan];
  NSArray *devices = _devices.allValues;
  if (_scanResolve) {
    _scanResolve(devices);
  }
  _scanResolve = nil;
  _scanReject = nil;
  [self emitOnScanDone:[self emptyEvent]];
}

- (void)connect:(NSString *)id resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:id];
  if (uuid == nil) {
    reject(@"NOT_FOUND", @"Invalid printer id", nil);
    return;
  }

  CBPeripheral *target = _peripherals[id];
  if (target == nil) {
    NSArray<CBPeripheral *> *known = [_central retrievePeripheralsWithIdentifiers:@[uuid]];
    target = known.firstObject;
  }
  if (target == nil) {
    reject(@"NOT_FOUND", @"Printer was not found. Scan before connecting.", nil);
    return;
  }

  [self finishScan];
  if (_peripheral && _peripheral != target) {
    [_central cancelPeripheralConnection:_peripheral];
  }

  _connectResolve = resolve;
  _connectReject = reject;
  _writeCharacteristic = nil;
  _pendingServices = 0;
  _peripheral = target;
  _peripheral.delegate = self;
  [_central connectPeripheral:target options:nil];
}

- (void)disconnect:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  if (_peripheral) {
    [_central cancelPeripheralConnection:_peripheral];
  }
  _peripheral = nil;
  _writeCharacteristic = nil;
  [self emitOnDisconnected:[self emptyEvent]];
  resolve(nil);
}

- (void)write:(NSString *)base64Data resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  if (_peripheral == nil || _writeCharacteristic == nil) {
    reject(@"NOT_CONNECTED", @"No printer is connected", nil);
    return;
  }

  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Data options:0];
  if (data.length == 0) {
    resolve(nil);
    return;
  }

  [_pendingChunks removeAllObjects];
  NSUInteger offset = 0;
  while (offset < data.length) {
    NSUInteger length = MIN(kBleChunkSize, data.length - offset);
    [_pendingChunks addObject:[data subdataWithRange:NSMakeRange(offset, length)]];
    offset += length;
  }

  _writeResolve = resolve;
  _writeReject = reject;
  _readyForWrite = YES;
  [self flushChunks];
}

- (void)flushChunks
{
  if (!_readyForWrite || _pendingChunks.count == 0 || _peripheral == nil || _writeCharacteristic == nil) {
    if (_pendingChunks.count == 0 && _writeResolve) {
      RCTPromiseResolveBlock resolve = _writeResolve;
      _writeResolve = nil;
      _writeReject = nil;
      resolve(nil);
    }
    return;
  }

  NSData *chunk = _pendingChunks.firstObject;
  [_pendingChunks removeObjectAtIndex:0];

  CBCharacteristicWriteType type = CBCharacteristicWriteWithoutResponse;
  if ((_writeCharacteristic.properties & CBCharacteristicPropertyWriteWithoutResponse) == 0) {
    type = CBCharacteristicWriteWithResponse;
  }

  if (type == CBCharacteristicWriteWithoutResponse && !_peripheral.canSendWriteWithoutResponse) {
    [_pendingChunks insertObject:chunk atIndex:0];
    _readyForWrite = NO;
    return;
  }

  [_peripheral writeValue:chunk forCharacteristic:_writeCharacteristic type:type];
  if (type == CBCharacteristicWriteWithoutResponse) {
    __weak typeof(self) weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kWritePause * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      [weakSelf flushChunks];
    });
  }
}

- (void)encode:(NSString *)text encoding:(NSString *)encoding resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSStringEncoding stringEncoding = NSUTF8StringEncoding;
  NSString *normalized = [[encoding lowercaseString] stringByReplacingOccurrencesOfString:@"-" withString:@""];
  if ([normalized isEqualToString:@"gbk"] || [normalized isEqualToString:@"gb2312"]) {
    stringEncoding = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingGB_18030_2000);
  } else if ([normalized isEqualToString:@"gb18030"]) {
    stringEncoding = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingGB_18030_2000);
  }

  NSData *data = [text dataUsingEncoding:stringEncoding allowLossyConversion:YES];
  resolve([data base64EncodedStringWithOptions:0]);
}

- (void)rasterizeMono:(NSString *)base64Image
         targetWidth:(double)targetWidth
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  NSError *error = nil;
  ImageRasterResult *result = [ImageRaster rasterizeMono:base64Image targetWidth:(NSInteger)targetWidth error:&error];
  if (result == nil) {
    reject(@"RASTER_FAILED", error.localizedDescription, error);
    return;
  }
  resolve(@{
    @"widthBytes": @(result.widthBytes),
    @"height": @(result.height),
    @"data": [result.data base64EncodedStringWithOptions:0]
  });
}

- (void)getConnectedDevice:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  if (_peripheral == nil) {
    resolve([self emptyDevice]);
    return;
  }
  resolve([self deviceDict:_peripheral]);
}

- (void)isConnected:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  resolve(@(_peripheral != nil && _writeCharacteristic != nil));
}

#pragma mark - CBCentralManagerDelegate

- (void)centralManagerDidUpdateState:(CBCentralManager *)central
{
  if (_stateResolve) {
    _stateResolve(@(central.state == CBManagerStatePoweredOn));
    _stateResolve = nil;
  }
  if (central.state != CBManagerStatePoweredOn && _peripheral) {
    _peripheral = nil;
    _writeCharacteristic = nil;
    [self emitOnConnectionLost:[self emptyEvent]];
  }
}

- (void)centralManager:(CBCentralManager *)central
 didDiscoverPeripheral:(CBPeripheral *)peripheral
     advertisementData:(NSDictionary<NSString *,id> *)advertisementData
                  RSSI:(NSNumber *)RSSI
{
  NSDictionary *device = [self deviceDict:peripheral];
  _devices[peripheral.identifier.UUIDString] = device;
  _peripherals[peripheral.identifier.UUIDString] = peripheral;
  [self emitOnDeviceFound:device];
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral
{
  peripheral.delegate = self;
  [peripheral discoverServices:nil];
}

- (void)centralManager:(CBCentralManager *)central didFailToConnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error
{
  if (_connectReject) {
    _connectReject(@"CONNECT_FAILED", error.localizedDescription, error);
  }
  _connectResolve = nil;
  _connectReject = nil;
}

- (void)centralManager:(CBCentralManager *)central didDisconnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error
{
  _writeCharacteristic = nil;
  if (error) {
    [self emitOnConnectionLost:[self emptyEvent]];
  } else {
    [self emitOnDisconnected:[self emptyEvent]];
  }
}

#pragma mark - CBPeripheralDelegate

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error
{
  if (error) {
    if (_connectReject) {
      _connectReject(@"CONNECT_FAILED", error.localizedDescription, error);
    }
    _connectResolve = nil;
    _connectReject = nil;
    return;
  }
  _pendingServices = (NSInteger)peripheral.services.count;
  if (_pendingServices == 0) {
    if (_connectReject) {
      _connectReject(@"CONNECT_FAILED", @"No BLE services found on printer", nil);
    }
    _connectResolve = nil;
    _connectReject = nil;
    return;
  }
  for (CBService *service in peripheral.services) {
    [peripheral discoverCharacteristics:nil forService:service];
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverCharacteristicsForService:(CBService *)service error:(NSError *)error
{
  for (CBCharacteristic *characteristic in service.characteristics) {
    BOOL canWrite = (characteristic.properties & CBCharacteristicPropertyWrite) != 0 ||
                    (characteristic.properties & CBCharacteristicPropertyWriteWithoutResponse) != 0;
    if (canWrite && _writeCharacteristic == nil) {
      _writeCharacteristic = characteristic;
    }
  }

  _pendingServices -= 1;
  if (_writeCharacteristic && _connectResolve) {
    RCTPromiseResolveBlock resolve = _connectResolve;
    _connectResolve = nil;
    _connectReject = nil;
    [self emitOnConnected:[self deviceDict:peripheral]];
    resolve(nil);
    return;
  }

  if (_pendingServices <= 0 && _writeCharacteristic == nil && _connectReject) {
    RCTPromiseRejectBlock reject = _connectReject;
    _connectResolve = nil;
    _connectReject = nil;
    reject(@"CONNECT_FAILED", @"No writable BLE characteristic found", nil);
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didWriteValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error
{
  if (error && _writeReject) {
    RCTPromiseRejectBlock reject = _writeReject;
    _writeResolve = nil;
    _writeReject = nil;
    reject(@"WRITE_FAILED", error.localizedDescription, error);
    return;
  }
  [self flushChunks];
}

- (void)peripheralIsReadyToSendWriteWithoutResponse:(CBPeripheral *)peripheral
{
  _readyForWrite = YES;
  [self flushChunks];
}

@end
