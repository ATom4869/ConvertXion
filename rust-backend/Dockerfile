FROM rust:1.84.1-slim as builder

# Add environment variables
ENV SERVER_IP=0.0.0.0
ENV SERVER_PORT=5100
ENV RUST_LOG=info
ENV RUST_BACKTRACE=1

WORKDIR /usr/src/app

COPY Cargo.toml Cargo.lock ./

# Install all required build dependencies
RUN apt-get update && \
    apt-get install -y \
    nasm \
    pkg-config \
    libssl-dev \
    cmake \
    build-essential \
    libjpeg-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

COPY . .

RUN cargo build --release && strip target/release/convertxion_engine

FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y \
    libjpeg62-turbo \
    libpng16-16 \
    libaom3 \
    libdav1d6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/local/bin

COPY --from=builder /usr/src/app/target/release/convertxion_engine .

EXPOSE 5100

CMD ["./convertxion_engine"]