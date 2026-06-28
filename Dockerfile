# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/ ./
RUN npm run build

# Stage 2: Build server
FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /snake ./cmd

# Stage 3: Runtime
FROM alpine:3.21

WORKDIR /app

COPY --from=builder /snake /usr/local/bin/snake
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/snake"]

CMD ["serve"]
