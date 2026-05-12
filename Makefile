.PHONY: build run clean test test-e2e test-all

BINARY_NAME=snake
BUILD_DIR=bin

build:
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd
	chmod +x $(BUILD_DIR)/$(BINARY_NAME)

run: build
	$(BUILD_DIR)/$(BINARY_NAME) serve

clean:
	rm -rf $(BUILD_DIR)

test:
	go test ./... -v -vet=off

test-e2e:
	go test ./e2e/... -v -vet=off

test-all: test test-e2e
