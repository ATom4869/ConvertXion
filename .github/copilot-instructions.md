# Copilot / AI Agent Quick Guide for ConvertXion

Short: this repo converts images (single-file via Node, multi-file via Rust engine) and returns converted files or a ZIP. Focus on these files when making changes: `backend/`, `nextjs/`, `rust-backend/`.

## Big picture

- Frontend: Next.js app (`nextjs/src/app`) hosts the UI and chooses API based on number of files: single-file → Node backend; multi-file → Rust engine. See `FileUpload.tsx` for exact logic. ⚖️
- Single-file service: Express TypeScript backend (`backend/`) uses `sharp` & `jimp` to convert images and returns the image directly (port 5000). Key: `backend/routes/convert.ts`.
- Multi-file service: Rust engine (`rust-backend/`) handles parallel processing, progress via WebSocket, and returns a ZIP (port 5100). Key: `rust-backend/src/{routes.rs,handlers.rs,image_utils.rs,ws_handler.rs}`.

## How to run (dev)

- Full stack: yarn start (root) — runs frontend and Node backend concurrently.
- Frontend only: cd nextjs && yarn dev (Next.js dev server).
- Node backend (dev): cd backend && yarn dev (ts-node-dev).
- Rust engine (dev): cd rust-backend && cargo run OR docker-compose up (there is a `docker-compose.yml` inside `rust-backend/`).
- Build steps: `yarn build` (Next.js), `cd backend && yarn build` (TypeScript → dist), `cd rust-backend && cargo build`.

## Ports & Endpoints

- Frontend: default Next port (3000). See `nextjs/package.json` scripts.
- Node backend: http://localhost:5000
  - POST /convert — single-file conversion, form fields: `image` (file), `format`, `quality`, `compression`, `width`, `height`, `keep_aspect_ratio`.
  - Implementation: `backend/routes/convert.ts`.
- Rust engine: http://localhost:5100
  - POST /api/convert?session_id=... — multi-file conversion (multipart form), include files under `file`, and settings under `format`, `quality`, `compression`, `keep_aspect_ratio`, `resolution` (string `width,height`). See `rust-backend/src/handlers.rs`.
  - WebSocket: ws://localhost:5100/api/ws?session_id=... — subscribe to progress updates. Format: JSON with `progress` (number), `filename`, `status`. See `rust-backend/src/ws_handler.rs` and `image_utils.rs` (progress messages).
  - POST /api/cancel — requests cancellation (uses shared AppState cancel flag).

## Config & Limits (runtime env variables)

- Rust engine supports env overrides (defaults in code):
  - `MAX_FILES` (default 3)
  - `MAX_FILE_SIZE` (MB, default 12MB)
  - `ALLOWED_FORMATS` (CSV like `jpg,png,webp,avif,bmp`)
  - `SERVER_PORT` / `RUST_LOG`
- Frontend and Node backend behavior is tuned to these defaults; change env vars for larger limits.

## Important implementation details & conventions

- Single-file (Node): uses Multer `memoryStorage()` (no disk writes). Special-case `.ppm` handled by Jimp → PNG. See `backend/routes/convert.ts`.
- Multi-file (Rust): concurrent processing uses a semaphore and memory accounting (`MAX_MEMORY_PER_FILE`) to avoid OOM. AVIF is processed sequentially for compatibility/perf. See `rust-backend/src/image_utils.rs`.
- Session IDs: frontend builds `session-${sha3_256('User-...')}`; WS/convert use `session_id` query param to correlate progress. See `nextjs/src/app/components/FileUpload.tsx` and `rust-backend/src/ws_handler.rs`.
- WebSocket messages are simple JSON strings (e.g., {"progress": 25.00, "filename": "img.png"}). Frontend contains tolerant parsing logic (it accepts some malformed messages).

## When you change formats or options

- Update three places:
  1. Frontend `SUPPORTED_FORMATS` (`nextjs/src/app/components/FileUpload.tsx`) — used to render UI and decide which sliders to show.
  2. Node backend `SUPPORTED_FORMATS` (`backend/routes/convert.ts`) — server-side validation/handling for single-file code path.
  3. Rust engine allowed formats and encoders (`rust-backend/src/handlers.rs` validations and `rust-backend/src/image_utils.rs` conversion match arms).
- PPM: both services include PPM special handling; keep this in mind when adding new raw formats.

## Debugging tips

- To reproduce frontend → rust flow locally: open dev UI, upload >1 file → watch `cargo run` logs and the WS connection to see progress messages.
- Use `curl` to test endpoints quickly (examples below).
- Check CORS: Node backend uses `cors({ origin: '*' })` (change for prod); Rust engine uses `actix-cors`.

## Quick examples

- Single-file (Node):
  curl -X POST http://localhost:5000/convert -F "image=@my.png" -F "format=jpg" -F "quality=80"

- Multi-file (Rust):
  curl -X POST "http://localhost:5100/api/convert?session_id=session-abc" -F "file=@a.png" -F "file=@b.png" -F "format=webp" -F "keep_aspect_ratio=true" -F "resolution=800,600" --output converted.zip

- WebSocket progress: connect to ws://localhost:5100/api/ws?session_id=session-abc and expect JSON messages with `progress` and `filename`.

---

If anything in here looks off or you want more detail on a specific area (build, testing, or image internals), tell me and I will iterate. ✅
