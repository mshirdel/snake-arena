// Package main provides the CLI entry point for the Snake server.
package main

import (
	"os"

	"github.com/spf13/cobra"
)

// rootCmd is the base command for the Snake server CLI.
var rootCmd = &cobra.Command{
	Use:   "snake",
	Short: "Snake is a real-time multiplayer snake game server",
}

// Execute runs the root command.
func Execute() error {
	return rootCmd.Execute()
}

func main() {
	if err := Execute(); err != nil {
		os.Exit(1)
	}
}