#import "ImageRaster.h"
#import <UIKit/UIKit.h>

@implementation ImageRasterResult
@end

@implementation ImageRaster

+ (ImageRasterResult *)rasterizeMono:(NSString *)base64Image
                        targetWidth:(NSInteger)targetWidth
                              error:(NSError **)error
{
  NSData *decoded = [[NSData alloc] initWithBase64EncodedString:base64Image options:0];
  UIImage *image = [UIImage imageWithData:decoded];
  if (image == nil) {
    if (error) {
      *error = [NSError errorWithDomain:@"EscTscPrinter" code:1 userInfo:@{
        NSLocalizedDescriptionKey: @"Unable to decode image"
      }];
    }
    return nil;
  }

  NSInteger width = ((MAX(targetWidth, 8) + 7) / 8) * 8;
  NSInteger height = MAX(1, (NSInteger)(image.size.height * width / image.size.width));

  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  NSMutableData *pixels = [NSMutableData dataWithLength:width * height * 4];
  CGContextRef context = CGBitmapContextCreate(
    pixels.mutableBytes,
    width,
    height,
    8,
    width * 4,
    colorSpace,
    kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
  );
  CGColorSpaceRelease(colorSpace);
  if (context == NULL) {
    if (error) {
      *error = [NSError errorWithDomain:@"EscTscPrinter" code:2 userInfo:@{
        NSLocalizedDescriptionKey: @"Unable to create image context"
      }];
    }
    return nil;
  }

  CGContextDrawImage(context, CGRectMake(0, 0, width, height), image.CGImage);
  CGContextRelease(context);

  NSMutableData *packed = [NSMutableData dataWithLength:(width / 8) * height];
  unsigned char *src = (unsigned char *)pixels.mutableBytes;
  unsigned char *dst = (unsigned char *)packed.mutableBytes;
  NSInteger index = 0;

  for (NSInteger y = 0; y < height; y++) {
    for (NSInteger xByte = 0; xByte < width / 8; xByte++) {
      unsigned char packedByte = 0;
      for (NSInteger bit = 0; bit < 8; bit++) {
        NSInteger x = xByte * 8 + bit;
        NSInteger offset = (y * width + x) * 4;
        NSInteger gray = (src[offset] * 30 + src[offset + 1] * 59 + src[offset + 2] * 11) / 100;
        if (gray < 128) {
          packedByte |= (unsigned char)(0x80 >> bit);
        }
      }
      dst[index++] = packedByte;
    }
  }

  ImageRasterResult *result = [ImageRasterResult new];
  result.widthBytes = width / 8;
  result.height = height;
  result.data = packed;
  return result;
}

@end
