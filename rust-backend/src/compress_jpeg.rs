// src/utils/compress.rs (atau langsung taruh di image_utils.rs)
use image::DynamicImage;
use mozjpeg::{ColorSpace, Compress, Subsamp};

/// Compress a resized image into JPEG format using MozJPEG.
///
/// # Arguments
/// * `img` - DynamicImage (already resized)
/// * `quality` - JPEG quality (0.0 - 100.0)
///
/// # Returns
/// Compressed JPEG bytes as Vec<u8>
pub fn compress_jpeg(img: &DynamicImage, quality: f32) -> Vec<u8> {
    // Convert image to RGB8 (MozJPEG expects raw RGB buffer)
    let rgb = img.to_rgb8();
    let (width, height) = img.dimensions();

    // Setup MozJPEG compressor
    let mut comp = Compress::new(ColorSpace::JCS_RGB);
    comp.set_size(width as usize, height as usize);
    comp.set_quality(quality);
    comp.set_subsample(Subsamp::Sub2x2); // 4:2:0 chroma subsampling
    comp.set_progressive_mode();

    // Start compression
    comp.start_compress();
    comp.write_scanlines(&rgb);
    let jpeg_bytes = comp.finish_compress();

    jpeg_bytes
}
