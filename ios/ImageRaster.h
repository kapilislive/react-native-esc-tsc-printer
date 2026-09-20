#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ImageRasterResult : NSObject
@property (nonatomic, assign) NSInteger widthBytes;
@property (nonatomic, assign) NSInteger height;
@property (nonatomic, strong) NSData *data;
@end

@interface ImageRaster : NSObject
+ (nullable ImageRasterResult *)rasterizeMono:(NSString *)base64Image
                                 targetWidth:(NSInteger)targetWidth
                                       error:(NSError **)error;
@end

NS_ASSUME_NONNULL_END
