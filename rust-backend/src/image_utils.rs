use crate::image_utils::rgb::bytemuck;
use crate::ws_handler::{MyWebSocket, ProgressMessage};
use actix::Addr;
use futures::future::join_all;
use image::io::Reader as ImageReader;
use image::{codecs::png::PngEncoder, DynamicImage, GenericImageView, ImageOutputFormat};
use log::error;
use log::{debug, info};
use mozjpeg::{ColorSpace, Compress};
use num_cpus;
use ravif::Encoder as AvifEncoder;
use rgb;
use std::io::Cursor;
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::Semaphore;
use webp::Encoder as WebpEncoder;
use zip::write::FileOptions;
use zip::write::ZipWriter;

const MAX_MEMORY_PER_FILE: usize = 50_108_864;

pub type ProgressChannels = Arc<Mutex<std::collections::HashMap<String, Addr<MyWebSocket>>>>;

#[derive(Clone)]
pub struct ImageSettings {
    pub format: String,
    pub resolution: Option<(u32, u32)>,
    pub keep_aspect_ratio: bool,
    pub quality: Option<u8>,     // Make quality optional
    pub compression: Option<u8>, // Make compression optional
}

pub fn convert_image(
    img: DynamicImage,
    settings: &ImageSettings,
    filename: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send>> {
    debug!("Processing file: {}", filename);

    let start_time = Instant::now();

    // Auto-fill missing quality or compression settings
    let quality = settings.quality.unwrap_or(80); // Default quality to 80 if not provided
    let compression = settings.compression.unwrap_or(8); // Default compression to 8 if not provided
    let png_compression = settings.compression.unwrap_or(2);

    debug!("Original image dimensions: {:?}", img.dimensions());

    let img = if let Some((width, height)) = settings.resolution {
        debug!("Resizing image to {}x{}", width, height);
        let (orig_width, orig_height) = img.dimensions();
        if width > orig_width || height > orig_height {
            debug!(
                "Upscaling image (original: {}x{}, target: {}x{})",
                orig_width, orig_height, width, height
            );
            if settings.keep_aspect_ratio {
                img.resize(width, height, image::imageops::FilterType::Lanczos3)
            } else {
                img.resize_exact(width, height, image::imageops::FilterType::Lanczos3)
            }
        } else {
            debug!(
                "Downscaling image (original: {}x{}, target: {}x{})",
                orig_width, orig_height, width, height
            );
            if settings.keep_aspect_ratio {
                img.resize(width, height, image::imageops::FilterType::Lanczos3)
            } else {
                img.resize_exact(width, height, image::imageops::FilterType::Lanczos3)
            }
        }
    } else {
        debug!("No resizing required");
        img
    };

    debug!("Resized image dimensions: {:?}", img.dimensions());

    let mut output = Cursor::new(Vec::new());
    match settings.format.as_str() {
        "png" => {
            debug!("Converting to PNG with compression: {}", png_compression);
            let compression_type = match png_compression {
                1 => image::codecs::png::CompressionType::Fast,
                2 => image::codecs::png::CompressionType::Default,
                3 => image::codecs::png::CompressionType::Best,
                _ => image::codecs::png::CompressionType::Default, // Fallback to Default if user input is outside 1-3
            };
            img.write_with_encoder(PngEncoder::new_with_quality(
                &mut output,
                compression_type,
                image::codecs::png::FilterType::Up,
            ))
            .map_err(|e| {
                debug!("Error converting to PNG: {}", e);
                Box::new(e) as Box<dyn std::error::Error + Send>
            })?;
        }
        "jpg" => {
            debug!(
                "Converting to JPG with quality: {} and compression: {}",
                quality, compression
            );

            let rgb = img.to_rgb8();
            let (width, height) = rgb.dimensions();

            // Build compressor
            let mut comp = Compress::new(ColorSpace::JCS_RGB);
            comp.set_size(width as usize, height as usize);
            comp.set_quality(quality as f32);
            comp.set_optimize_coding(true); // better Huffman tables

            // Compression presets
            match compression {
                1 => {
                    // High compression → file kecil
                    comp.set_chroma_sampling_pixel_sizes((2, 2), (2, 2)); // 4:2:0
                    comp.set_use_scans_in_trellis(true);
                    comp.set_optimize_scans(true);
                    comp.set_smoothing_factor(3);
                    comp.set_progressive_mode();
                }
                2 => {
                    // Medium
                    comp.set_chroma_sampling_pixel_sizes((2, 1), (2, 1)); // 4:2:2
                    comp.set_use_scans_in_trellis(true);
                    comp.set_optimize_scans(true);
                    comp.set_smoothing_factor(1);
                    comp.set_progressive_mode();
                }
                3 => {
                    // Low compression → kualitas tinggi
                    comp.set_chroma_sampling_pixel_sizes((1, 1), (1, 1)); // 4:4:4
                    comp.set_optimize_scans(false);
                    comp.set_smoothing_factor(0);
                    // no progressive → baseline
                }
                _ => {
                    // default medium
                    comp.set_chroma_sampling_pixel_sizes((2, 1), (2, 1));
                    comp.set_smoothing_factor(1);
                    comp.set_progressive_mode();
                }
            }

            // Start compression
            let mut started = comp
                .start_compress(Vec::new())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;

            started
                .write_scanlines(rgb.as_raw())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;

            let jpeg_data = started
                .finish()
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;

            output.write_all(&jpeg_data).map_err(|e| {
                debug!("Error writing JPG data: {}", e);
                Box::new(e) as Box<dyn std::error::Error + Send>
            })?;
        }
        "avif" => {
            debug!("Converting to AVIF with quality: {}", quality);

            let rgba = img.to_rgba8(); // Convert to RGBA

            // Full-core encoder
            let encoder = AvifEncoder::new()
                .with_quality(quality as f32)
                .with_speed(compression)
                .with_num_threads(Some(num_cpus::get_physical())); // pakai semua core fisik

            // Convert pixel data
            let pixels: &[rgb::RGBA8] = bytemuck::cast_slice(rgba.as_raw());
            let img_data = ravif::Img::new(pixels, img.width() as usize, img.height() as usize);

            // Encode
            let encoded = encoder.encode_rgba(img_data).map_err(|e| {
                debug!("Error encoding AVIF: {}", e);
                Box::new(e) as Box<dyn std::error::Error + Send>
            })?;

            // Write output
            output.write_all(&encoded.avif_file).map_err(|e| {
                debug!("Error writing AVIF data: {}", e);
                Box::new(e) as Box<dyn std::error::Error + Send>
            })?;
        }
        "webp" => {
            debug!("Converting to WebP with quality: {}", quality);
            let encoder = WebpEncoder::from_image(&img).map_err(|e| {
                debug!("Error creating WebP encoder: {}", e);
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                )) as Box<dyn std::error::Error + Send>
            })?;
            let webp_data = encoder.encode(quality as f32);
            output.write_all(&webp_data).map_err(|e| {
                debug!("Error writing WebP data: {}", e);
                Box::new(e) as Box<dyn std::error::Error + Send>
            })?;
        }
        "bmp" => {
            debug!("Converting to BMP");
            // BMP in the image crate only supports uncompressed format
            img.write_to(&mut output, ImageOutputFormat::Bmp)
                .map_err(|e| {
                    debug!("Error converting to BMP: {}", e);
                    Box::new(e) as Box<dyn std::error::Error + Send>
                })?;
        }
        _ => {
            let err_msg = format!("Unsupported format: {}", settings.format);
            debug!("{}", err_msg);
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                err_msg,
            )) as Box<dyn std::error::Error + Send>);
        }
    }

    let elapsed_time = start_time.elapsed();
    debug!("Finished processing file: {}", filename);
    debug!("Encoding time for {}: {:?}", filename, elapsed_time);
    Ok(output.into_inner())
}

pub async fn process_images(
    files: Vec<(String, Vec<u8>)>,
    settings: ImageSettings,
    session_id: String,
    progress_channels: ProgressChannels,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send>> {
    let total_files = files.len();

    let progress_per_file = 80.0 / total_files as f32;
    let start_total = Instant::now();

    // Calculate optimal thread count based on available cores and workload
    let desired_threads = std::cmp::min(
        total_files, // Don't exceed number of files
        std::cmp::max(
            2,                        // At least 2 threads
            num_cpus::get_physical(), // Use physical core count instead of logical
        ),
    );

    info!("🔧 Using {} processing threads", desired_threads);

    // ✅ Initial beautiful console log
    info!("=========================================");
    info!("📂 Total files to process: {}", total_files);
    for (filename, _) in &files {
        info!("➡️  File: {}", filename);
    }
    info!("🎯 Target Format: {}", settings.format);
    info!(
        "📐 Resolution: {}",
        settings
            .resolution
            .map_or("Original".to_string(), |(w, h)| format!("{}x{}", w, h))
    );
    info!(
        "🛠️ Quality: {}",
        settings
            .quality
            .map_or("Default".to_string(), |q| q.to_string())
    );
    info!(
        "🛠️ Compression: {}",
        settings
            .compression
            .map_or("Default".to_string(), |c| c.to_string())
    );
    info!(
        "📏 Keep Aspect Ratio: {}",
        if settings.keep_aspect_ratio {
            "Yes"
        } else {
            "No"
        }
    );
    info!("=========================================");

    if let Some(addr) = progress_channels.lock().unwrap().get(&session_id) {
        let _ = addr.try_send(ProgressMessage(
            "{\"progress\": 10.00, \"filename\": \"Uploading started...\"}".to_string(),
        ));
    }

    info!("✅ Files successfully validated and ready to process...");

    // Prepare output storage
    let mut results: Vec<(String, Vec<u8>)> = Vec::new();

    // Handle AVIF sequentially, others concurrently with CPU limit
    if settings.format == "avif" {
        // ➡️ Sequential AVIF processing
        for (index, (filename, data)) in files.into_iter().enumerate() {
            let start_file = Instant::now();

            let (new_filename, converted_data) = process_single_image(
                filename,
                data,
                &settings,
                &session_id,
                &progress_channels,
                index,
                total_files,
                progress_per_file,
            )?;

            let duration_file = start_file.elapsed();
            info!("⏱️ Processed '{}' in {:.2?}", new_filename, duration_file);

            results.push((new_filename, converted_data));
        }
    } else {
        // Parallel processing using Tokio with memory limit
        let semaphore = Arc::new(Semaphore::new(desired_threads));
        // Use MAX_MEMORY_PER_FILE to calculate total memory limit
        let memory_semaphore = Arc::new(Semaphore::new(MAX_MEMORY_PER_FILE * desired_threads));
        let session_id = Arc::new(session_id);
        let progress_channels = Arc::clone(&progress_channels);
        let settings = Arc::new(settings);

        let tasks: Vec<_> = files
            .into_iter()
            .enumerate()
            .map(|(index, (filename, data))| {
                let permit = semaphore.clone().acquire_owned();
                let mem_permit = memory_semaphore
                    .clone()
                    .acquire_many_owned(data.len() as u32);
                let session_id = session_id.clone();
                let progress_channels = progress_channels.clone();
                let settings = settings.clone();

                tokio::spawn(async move {
                    let _permit = permit.await;
                    let _mem_permit = mem_permit.await;
                    let start_file = Instant::now();

                    let result = tokio::task::spawn_blocking(move || {
                        process_single_image(
                            filename,
                            data,
                            &settings,
                            &session_id,
                            &progress_channels,
                            index,
                            total_files,
                            progress_per_file,
                        )
                    })
                    .await
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)??;

                    // Memory permit is automatically released here when _mem_permit goes out of scope
                    let (new_filename, converted_data) = result;
                    let duration_file = start_file.elapsed();
                    info!("⏱️ Processed '{}' in {:.2?}", new_filename, duration_file);

                    Ok::<_, Box<dyn std::error::Error + Send>>((new_filename, converted_data))
                })
            })
            .collect();

        let results_temp = join_all(tasks).await;
        for res in results_temp {
            results.push(res.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)??);
        }
    }

    // Final ZIP creation
    let mut zip_buffer = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(&mut zip_buffer);

    for (filename, data) in results {
        zip.start_file(filename, FileOptions::default())
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        zip.write_all(&data)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
    }

    zip.finish()
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
    drop(zip);

    let total_duration = start_total.elapsed();
    info!(
        "✅ All files processed and zipped successfully in {:.2?}",
        total_duration
    );

    Ok(zip_buffer.into_inner())
}

fn process_single_image(
    filename: String,
    data: Vec<u8>,
    settings: &ImageSettings,
    session_id: &str,
    progress_channels: &ProgressChannels,
    index: usize,
    total_files: usize,
    progress_per_file: f32,
) -> Result<(String, Vec<u8>), Box<dyn std::error::Error + Send>> {
    info!(
        "🚀 [Thread: {:?}] [{} / {}] Starting processing for file: {}",
        std::thread::current().id(), // Add thread ID to see concurrent processing
        index + 1,
        total_files,
        filename
    );

    // Decode image correctly
    let img = if filename.ends_with(".ppm") {
        // Decode PPM manually
        ImageReader::new(Cursor::new(&data))
            .with_guessed_format()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?
            .decode()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?
    } else {
        image::load_from_memory(&data)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?
    };

    // Convert image
    let converted_data = convert_image(img, settings, &filename)?;

    // Prepare new filename
    let new_filename = format!(
        "{}.{}",
        filename
            .trim_end_matches(".ppm")
            .trim_end_matches(".png")
            .trim_end_matches(".jpg")
            .trim_end_matches(".jpeg")
            .trim_end_matches(".webp")
            .trim_end_matches(".bmp")
            .trim_end_matches(".avif"),
        settings.format
    );

    // Calculate progress
    let progress = 10.0 + (progress_per_file * (index as f32 + 1.0));

    // Log and WebSocket update
    info!(
        "📦 [{}] Progress: {:.2}% | File: {}",
        session_id, progress, new_filename
    );

    if let Some(addr) = progress_channels.lock().unwrap().get(session_id) {
        let _ = addr.try_send(ProgressMessage(format!(
            "{{\"progress\": {:.2}, \"filename\": \"{}\"}}",
            progress, new_filename
        )));
    } else {
        error!("❌ No WebSocket client for session_id: {}", session_id);
    }

    Ok((new_filename, converted_data))
}
