use crate::handlers::{cancel_conversion, convert_image, health_check};
use crate::ws_handler::ws_route;
use actix_web::web; // Import the cancel_conversion handler

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api") // Group routes under `/api`
            .route("/health", web::get().to(health_check)) // Health check endpoint
            .route("/convert", web::post().to(convert_image)) // Image conversion endpoint
            .route("/cancel", web::post().to(cancel_conversion)) // Cancel conversion endpoint
            .route("/ws", web::get().to(ws_route)),
    );
}
