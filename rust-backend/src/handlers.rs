use crate::image_utils::{process_images, ImageSettings};
use crate::ws_handler::{ProgressChannels, ProgressMessage};
use actix_multipart::Multipart;
use actix_web::{web, Error, HttpResponse};
use futures::StreamExt;
use log::debug;
use serde::de::{self, Visitor};
use serde::Deserialize;
use std::env;
use std::fmt;
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

#[derive(Debug, Deserialize, Default)]
pub struct ImageSettingsForm {
    #[serde(default)]
    pub resolution: Resolution,
    pub keep_aspect_ratio: bool,
    pub quality: Option<u8>,
    pub compression: Option<u8>,
    pub format: String,
}

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub session_id: String,
}

#[derive(Debug, Default)]
pub struct Resolution(pub Option<(u32, u32)>);

impl<'de> Deserialize<'de> for Resolution {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct ResolutionVisitor;
        impl<'de> Visitor<'de> for ResolutionVisitor {
            type Value = Resolution;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a string in the format 'width,height'")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                let parts: Vec<&str> = value.split(',').collect();
                if parts.len() == 2 {
                    let width = parts[0].parse::<u32>().map_err(de::Error::custom)?;
                    let height = parts[1].parse::<u32>().map_err(de::Error::custom)?;
                    Ok(Resolution(Some((width, height))))
                } else {
                    Err(de::Error::custom(
                        "Invalid resolution format. Expected 'width,height'",
                    ))
                }
            }
        }

        deserializer.deserialize_str(ResolutionVisitor)
    }
}

#[derive(Clone)]
pub struct AppState {
    pub cancel_flag: Arc<Mutex<bool>>,
    pub cancel_notify: Arc<Notify>,
}

// ✅ FILE VALIDATION FUNCTION (INCLUDED)
pub async fn files_validation(files: &[(String, Vec<u8>)], format: &str) -> Result<(), Error> {
    let max_files: usize = env::var("MAX_FILES")
        .unwrap_or_else(|_| "3".to_string())
        .parse()
        .unwrap_or(3);
    let max_file_size: usize = env::var("MAX_FILE_SIZE")
        .unwrap_or_else(|_| "12".to_string())
        .parse::<usize>()
        .unwrap_or(12)
        * 1024
        * 1024;
    let allowed_formats: Vec<String> = env::var("ALLOWED_FORMATS")
        .unwrap_or_else(|_| "jpg,png,webp,avif,bmp".to_string())
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();

    if files.len() > max_files {
        return Err(actix_web::error::ErrorBadRequest(format!(
            "Maximum {} files allowed. You uploaded {} files.",
            max_files,
            files.len()
        )));
    }

    for (filename, data) in files {
        if data.len() > max_file_size {
            return Err(actix_web::error::ErrorBadRequest(format!(
                "File {} exceeds the {} MB size limit.",
                filename,
                max_file_size / 1024 / 1024
            )));
        }
    }

    if !allowed_formats.contains(&format.to_string()) {
        return Err(actix_web::error::ErrorBadRequest(format!(
            "Format '{}' is not allowed. Allowed formats: {}",
            format,
            allowed_formats.join(", ")
        )));
    }

    Ok(())
}

// ✅ HEALTH CHECK ROUTE
pub async fn health_check() -> HttpResponse {
    HttpResponse::Ok().body("Server is running!")
}

// ✅ CANCEL ENDPOINT
pub async fn cancel_conversion(state: web::Data<AppState>) -> HttpResponse {
    *state.cancel_flag.lock().unwrap() = true;
    state.cancel_notify.notify_one();
    HttpResponse::Ok().body("Conversion canceled")
}

// ✅ MAIN HANDLER FOR CONVERSION
pub async fn convert_image(
    mut payload: Multipart,
    web::Query(session_query): web::Query<SessionQuery>,
    state: web::Data<AppState>,
    progress_channels: web::Data<ProgressChannels>,
) -> Result<HttpResponse, Error> {
    let mut files = Vec::new();
    let mut image_settings: Option<ImageSettingsForm> = None;

    // Send progress: 10% upload/validation start
    if let Some(addr) = progress_channels
        .lock()
        .unwrap()
        .get(&session_query.session_id)
    {
        addr.do_send(ProgressMessage(
            "{\"progress\": 10.00% - Files uploading started}".to_string(),
        ));
    }

    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content_disposition = field.content_disposition().clone();
        let name = content_disposition.get_name().unwrap_or("");
        let mut data = Vec::new();

        while let Some(chunk) = field.next().await {
            let chunk = chunk?;
            data.extend_from_slice(&chunk[..]);

            // ✅ Check for cancel during upload
            if *state.cancel_flag.lock().unwrap() {
                return Err(actix_web::error::ErrorBadRequest("Conversion canceled"));
            }
        }

        if name == "file" {
            let filename = content_disposition
                .get_filename()
                .unwrap_or("unknown")
                .to_string();
            files.push((filename, data));
        } else {
            let text = String::from_utf8(data).unwrap_or_default();
            let form = image_settings.get_or_insert_with(Default::default);
            match name {
                "format" => form.format = text,
                "quality" => form.quality = text.parse().ok(),
                "compression" => form.compression = text.parse().ok(),
                "keep_aspect_ratio" => form.keep_aspect_ratio = text == "true",
                "resolution" => {
                    form.resolution =
                        serde_json::from_str(&format!("\"{}\"", text)).unwrap_or_default()
                }
                _ => {}
            }
        }
    }

    // ✅ After validation complete
    files_validation(&files, &image_settings.as_ref().unwrap().format).await?;

    if let Some(addr) = progress_channels
        .lock()
        .unwrap()
        .get(&session_query.session_id)
    {
        addr.do_send(ProgressMessage(
            "{\"progress\": 25.00% - Files Validated}".to_string(),
        )); // 25% validated
    }

    // ✅ Prepare ImageSettings
    let image_settings = image_settings
        .ok_or_else(|| actix_web::error::ErrorBadRequest("Image settings missing"))?;
    let settings = ImageSettings {
        format: image_settings.format,
        resolution: image_settings.resolution.0,
        keep_aspect_ratio: image_settings.keep_aspect_ratio,
        quality: image_settings.quality,
        compression: image_settings.compression,
    };

    // ✅ Send ready to convert
    if let Some(addr) = progress_channels
        .lock()
        .unwrap()
        .get(&session_query.session_id)
    {
        addr.do_send(ProgressMessage(
            "{\"progress\": 30.00% - Processing the files..}".to_string(),
        )); // 30% ready to start
    }

    // ✅ Process files
    let zip_data = process_images(
        files,
        settings,
        session_query.session_id.clone(),
        progress_channels.as_ref().clone(),
    )
    .await
    .map_err(|e| {
        debug!("Error processing images: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to process images")
    })?;

    Ok(HttpResponse::Ok()
        .content_type("application/zip")
        .body(zip_data))
}
