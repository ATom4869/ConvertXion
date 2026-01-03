# ConvertXion — Image conversion service

🔧 Short: ConvertXion converts images. Single-file uploads go to a Node/Express service (sharp/jimp); multi-file uploads use a Rust engine that processes files concurrently and returns a ZIP with progress over WebSocket.

## Architecture (big picture) ✅

- Frontend: Next.js app at `nextjs/` (UI & upload logic). Key file: `nextjs/src/app/components/FileUpload.tsx`.
- Single-file service: Node + Express at `backend/` (port 5000). Key file: `backend/routes/convert.ts` — uses Sharp and Jimp; Multer uses memory storage and `.ppm` is handled specially.
- Multi-file service: Rust engine at `rust-backend/` (port 5100). Key files: `rust-backend/src/handlers.rs`, `rust-backend/src/image_utils.rs`, `rust-backend/src/ws_handler.rs`.
- Communication:
  - Frontend → Node (single): POST `http://localhost:5000/convert` (form file `image`)
  - Frontend → Rust (multi): POST `http://localhost:5100/api/convert?session_id=...` (multipart form, files named `file`) and WebSocket `ws://localhost:5100/api/ws?session_id=...` for progress.

## Requirements

- Node (v20+ recommended)
- Yarn v4 (project uses Yarn Modern Workspaces)
- Rust toolchain (stable) and Cargo
- Optional: Docker (for `rust-backend` via `docker-compose`)

## Quick setup (dev) — commands you will use most

1. Install JS deps (at repo root):
   ```bash
   corepack enable
   corepack prepare yarn@4.7.0 --activate
   yarn install
   ```
2. Start full stack (frontend + node backend):
   ```bash
   yarn start
   # - frontend: http://localhost:3000
   # - node backend: http://localhost:5000
   ```
3. Run only frontend or backend during development:
   ```bash
   cd nextjs && yarn dev
   cd backend && yarn dev        # ts-node-dev
   ```
4. Run the Rust engine (multi-file):
   ```bash
   yarn engine    # runs `cd rust-backend && cargo run RUST_BACKTRACE=1` per package.json
   # or run directly: cd rust-backend && cargo run
   ```
5. Build steps:
   ```bash
   yarn build                   # build Next.js
   cd backend && yarn build     # tsc → dist
   cd rust-backend && cargo build
   ```

## Useful endpoints & examples

- Single-file (Node):
  ```bash
  curl -X POST http://localhost:5000/convert -F "image=@my.png" -F "format=jpg" -F "quality=80"
  ```
- Multi-file (Rust):
  ```bash
  curl -X POST "http://localhost:5100/api/convert?session_id=session-abc" \
    -F "file=@a.png" -F "file=@b.png" -F "format=webp" -F "keep_aspect_ratio=true" \
    -F "resolution=800,600" --output converted.zip
  ```
- WebSocket progress: connect to `ws://localhost:5100/api/ws?session_id=session-abc` and expect JSON messages like `{ "progress": 25.00, "filename": "img.png" }`.
- Cancel multi-file processing: POST `http://localhost:5100/api/cancel` (uses shared AppState cancel flag).

## Important implementation details & conventions (for contributors) 🔧

- When adding or changing supported formats, update three places:
  1. Frontend `SUPPORTED_FORMATS` (`nextjs/src/app/components/FileUpload.tsx`) — UI controls and validation.
  2. Node backend `SUPPORTED_FORMATS` (`backend/routes/convert.ts`) — server validation and conversion mapping.
  3. Rust engine validation (`rust-backend/src/handlers.rs`) and conversion match (`rust-backend/src/image_utils.rs`).
- PPM handling: both Node and Rust have special PPM decoding logic — preserve compatibility when adding raw formats.
- Rust engine concurrency: AVIF encoding is run sequentially (design choice). Other formats use a semaphore + memory accounting (`MAX_MEMORY_PER_FILE`) to avoid OOM — see `image_utils.rs`.
- Environment-driven limits (Rust): `MAX_FILES`, `MAX_FILE_SIZE` (MB), `ALLOWED_FORMATS`, `SERVER_PORT`, `RUST_LOG`.

## Debugging tips

- Reproduce multi-file flow: run frontend (`yarn dev`), upload >1 file, watch `cargo run` logs and WebSocket messages.
- Increase verbose logs for Rust: `RUST_LOG=debug cargo run` or set `RUST_LOG` in Docker compose.
- Common problems:
  - OOM during parallel processing → lower concurrency or increase memory semaphore.
  - AVIF is slow by design (sequential) — expect longer processing.

## Git & repository housekeeping

- The repo uses a `.gitignore` including `**/node_modules/`, `backend/uploads/`, `target/`, and other build artifacts. If `node_modules` was previously committed, run:
  ```bash
  git rm -r --cached node_modules/
  git commit -m "remove node_modules from repo"
  ```
- Do NOT commit `.env` files or other secrets; they are ignored by default.

## Where to look first when changing code

- UI flow & UX: `nextjs/src/app/components/FileUpload.tsx`
- Node single-file conversion: `backend/routes/convert.ts`
- Rust multi-file conversion: `rust-backend/src/{handlers.rs,image_utils.rs,ws_handler.rs}`

---
