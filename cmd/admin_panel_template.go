package main

import "html/template"

var adminPanelTemplate = template.Must(template.New("admin-panel").Parse(`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Snake Admin</title>
	<style>
		body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fa; color: #1f2937; }
		main { max-width: 860px; margin: 48px auto; padding: 0 24px; }
		h1 { margin: 0 0 24px; font-size: 32px; font-weight: 700; }
		.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
		.stat { background: #fff; border: 1px solid #d8dee4; border-radius: 8px; padding: 20px; }
		.label { color: #57606a; font-size: 14px; margin-bottom: 10px; }
		.value { font-size: 42px; font-weight: 700; line-height: 1; }
	</style>
</head>
<body>
	<main>
		<h1>Snake Admin</h1>
		<section class="stats" aria-label="Server statistics">
			<div class="stat">
				<div class="label">WebSocket connections</div>
				<div class="value">{{.WebSocketConnections}}</div>
			</div>
			<div class="stat">
				<div class="label">Rooms with players</div>
				<div class="value">{{.RoomsWithPlayers}}</div>
			</div>
			<div class="stat">
				<div class="label">Online users playing</div>
				<div class="value">{{.OnlineUsers}}</div>
			</div>
			<div class="stat">
				<div class="label">Total users who played</div>
				<div class="value">{{.TotalPlayedUsers}}</div>
			</div>
		</section>
	</main>
</body>
</html>`))
