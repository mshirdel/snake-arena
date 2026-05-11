package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var (
	configPath string

	serveCmd = &cobra.Command{
		Use:   "serve",
		Short: "Start the Snake game server",
		RunE:  runServe,
	}
)

func init() {
	serveCmd.Flags().StringVarP(&configPath, "config", "c", "", "Path to config file (default: config.yaml)")
	rootCmd.AddCommand(serveCmd)
}

func runServe(cmd *cobra.Command, args []string) error {
	fmt.Println("test is ok")

	return nil
}

