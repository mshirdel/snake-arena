package config

import (
	"fmt"
	"time"
)

// Config holds all server configuration.
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Game     GameConfig     `yaml:"game"`
	Network  NetworkConfig  `yaml:"network"`
}

// ServerConfig contains HTTP server settings.
type ServerConfig struct {
	Port            int           `yaml:"port" default:"8080"`
	Host            string        `yaml:"host" default:"localhost"`
	ReadTimeout     time.Duration `yaml:"read_timeout" default:"10s"`
	WriteTimeout    time.Duration `yaml:"write_timeout" default:"10s"`
	ShutdownTimeout time.Duration `yaml:"shutdown_timeout" default:"30s"`
}

// GameConfig contains game settings.
type GameConfig struct {
	TickRate        int `yaml:"tick_rate" default:"10"`
	DefaultWidth    int `yaml:"default_width" default:"40"`
	DefaultHeight   int `yaml:"default_height" default:"30"`
	MaxPlayersPerRoom int `yaml:"max_players_per_room" default:"4"`
	DefaultFoodCount  int `yaml:"default_food_count" default:"5"`
	SnakeStartLength  int `yaml:"snake_start_length" default:"3"`
}

// NetworkConfig contains WebSocket settings.
type NetworkConfig struct {
	MaxMessageSize int           `yaml:"max_message_size" default:"65536"`
	WriteTimeout   time.Duration `yaml:"write_timeout" default:"10s"`
	PingInterval   time.Duration `yaml:"ping_interval" default:"30s"`
}

// DefaultConfig returns a config with sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Port:            8080,
			Host:            "localhost",
			ReadTimeout:     10 * time.Second,
			WriteTimeout:    10 * time.Second,
			ShutdownTimeout: 30 * time.Second,
		},
		Game: GameConfig{
			TickRate:          10,
			DefaultWidth:      40,
			DefaultHeight:     30,
			MaxPlayersPerRoom: 4,
			DefaultFoodCount:  5,
			SnakeStartLength:  3,
		},
		Network: NetworkConfig{
			MaxMessageSize: 65536,
			WriteTimeout:   10 * time.Second,
			PingInterval:   30 * time.Second,
		},
	}
}

// Validate checks if the config is valid.
func (c *Config) Validate() error {
	if c.Server.Port < 1 || c.Server.Port > 65535 {
		return fmt.Errorf("invalid port: %d", c.Server.Port)
	}
	if c.Game.TickRate < 1 || c.Game.TickRate > 60 {
		return fmt.Errorf("tick rate must be between 1 and 60, got %d", c.Game.TickRate)
	}
	if c.Game.DefaultWidth < 5 || c.Game.DefaultHeight < 5 {
		return fmt.Errorf("board dimensions must be at least 5x5")
	}
	if c.Game.MaxPlayersPerRoom < 1 {
		return fmt.Errorf("max players per room must be at least 1")
	}
	return nil
}

// Addr returns the formatted server address.
func (s *ServerConfig) Addr() string {
	return fmt.Sprintf("%s:%d", s.Host, s.Port)
}
