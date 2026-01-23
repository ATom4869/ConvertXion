use actix_cors::Cors;
use actix_web::{http, web, App, HttpServer};
use crossterm::event::{self, Event, KeyCode};
use dotenv::dotenv;
use env_logger::Env;
use log::info;
use std::collections::HashMap;
use std::env;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::sync::Notify;
use ws_handler::ProgressChannels;

mod handlers;
mod image_utils;
mod routes;
mod ws_handler;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();

    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    let progress_channels: ProgressChannels = Arc::new(Mutex::new(HashMap::new()));

    // Get server IP and port from .env
    let ip = env::var("SERVER_IP").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("SERVER_PORT").unwrap_or_else(|_| "8080".to_string());
    let server_address = format!("{}:{}", ip, port);

    // Global state for cancellation
    let app_state = handlers::AppState {
        cancel_flag: Arc::new(Mutex::new(false)),
        cancel_notify: Arc::new(Notify::new()),
    };

    // Graceful shutdown logic
    let (shutdown_sender, mut shutdown_receiver) = mpsc::channel::<String>(1);
    shutdown_sender
        .send("Shutting down...".to_string())
        .await
        .unwrap();

    if let Some(message) = shutdown_receiver.recv().await {
        info!("{}", message);
    }

    let allowed_origin =
        env::var("ALLOWED_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".to_string());

    // Start the server
    let server = HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin(&allowed_origin)
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allowed_headers(vec![
                http::header::AUTHORIZATION,
                http::header::ACCEPT,
                http::header::CONTENT_TYPE,
            ])
            .supports_credentials()
            .max_age(1200);

        App::new()
            .app_data(web::Data::new(app_state.clone())) // Add global state
            .app_data(web::Data::new(progress_channels.clone()))
            .wrap(cors)
            .configure(routes::config)
    })
    .bind(&server_address)?
    .run();

    info!("Starting server at http://{}", server_address);
    info!("Press 'q' to shut down the server.");

    // Graceful shutdown listener
    let server_handle = server.handle();
    tokio::spawn(async move {
        loop {
            if event::poll(std::time::Duration::from_millis(100)).unwrap() {
                if let Event::Key(key_event) = event::read().unwrap() {
                    if key_event.code == KeyCode::Char('q') {
                        info!("Received 'q' key. Shutting down...");
                        break;
                    }
                    if key_event.code == KeyCode::Char('a') {
                        info!("Received 'a' key. Shutting down...");
                        break;
                    }
                }
            }
        }
        server_handle.stop(true).await; // Graceful shutdown
    });

    // Wait for the server to finish
    server.await
}
