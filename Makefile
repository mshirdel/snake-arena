.PHONY: build run clean

BINARY_NAME=snake
BUILD_DIR=bin

build:
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd
	chmod +x $(BUILD_DIR)/$(BINARY_NAME)

run: build
	$(BUILD_DIR)/$(BINARY_NAME) serve

clean:
	rm -rf $(BUILD_DIR)
