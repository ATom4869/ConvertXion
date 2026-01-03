use actix::ActorContext;
use actix::{Actor, Addr, AsyncContext, Message, StreamHandler};
use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Shared global state for progress channels
pub type ProgressChannels = Arc<Mutex<HashMap<String, Addr<MyWebSocket>>>>;

// Message to send progress
#[derive(Message)]
#[rtype(result = "()")]
pub struct ProgressMessage(pub String);

// WebSocket actor
pub struct MyWebSocket {
    // <-- PUBLIC STRUCT
    pub session_id: String,
    pub channels: ProgressChannels,
}

impl Actor for MyWebSocket {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        println!("Client connected: {}", self.session_id);
        // Register session
        self.channels
            .lock()
            .unwrap()
            .insert(self.session_id.clone(), ctx.address());
    }

    fn stopped(&mut self, _: &mut Self::Context) {
        println!("Client disconnected: {}", self.session_id);
        // Remove session
        self.channels.lock().unwrap().remove(&self.session_id);
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for MyWebSocket {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Text(text)) => {
                println!("Received: {}", text);
                if text == "cancel" {
                    // Handle cancel here if you want
                }
            }
            Ok(ws::Message::Close(_)) => {
                ctx.stop();
            }
            _ => {}
        }
    }
}

impl actix::Handler<ProgressMessage> for MyWebSocket {
    type Result = ();

    fn handle(&mut self, msg: ProgressMessage, ctx: &mut Self::Context) {
        ctx.text(msg.0); // Send progress update as WebSocket message
    }
}

// Route to start WebSocket
pub async fn ws_route(
    req: HttpRequest,
    stream: web::Payload,
    channels: web::Data<ProgressChannels>,
) -> Result<HttpResponse, Error> {
    let query = req.query_string();
    let session_id = query.split('=').nth(1).unwrap_or("unknown").to_string();

    let ws = MyWebSocket {
        session_id,
        channels: channels.get_ref().clone(),
    };

    ws::start(ws, &req, stream)
}
