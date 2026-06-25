# Stage 1: Build
FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /snake ./cmd

# Stage 2: Runtime
FROM alpine:3.21

COPY --from=builder /snake /usr/local/bin/snake

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/snake"]

CMD ["serve"]
