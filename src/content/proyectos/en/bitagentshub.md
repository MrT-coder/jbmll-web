---
titulo: BitAgentsHub, a pixel-art office in your terminal for your Claude Code agents
desc: Terminal app where every running Claude Code agent is a character at its desk, with its real terminals, its token spend and your plan's limits.
estado: construyendo
contexto: personal
fecha: 2026-10
st:
  - Go
  - GitHub Actions
kw:
  - terminal
  - AI agents
  - pseudo terminal
  - background process
  - open source
repo: https://github.com/MrT-coder/bitagentshub
destacado: false
borrador: false
---

I built a terminal app where every running Claude Code agent is a character at its desk: you see who is working, thinking or waiting, open any agent's terminal in a window, and follow its token spend and your plan's limits. Everything is read from local files and nothing is sent anywhere. It is a single binary, `bah`, for Windows, macOS and Linux, under the MIT license.

![BitAgentsHub banner: a green pixel-art office with agents at their desks and a cat in a corner](/media/bitagentshub-oficina.webp "BitAgentsHub: an office in the terminal, one desk per agent.")

## A background process that owns the terminals

The pseudo terminals are not owned by the office window but by a separate process. So quitting the office, losing an SSH connection or rebuilding the executable does not end the running agents. It listens only on a pipe (a socket outside Windows) that only the same user can open, and exits by itself when no office is attached and no program runs.

## Real terminals in every window

Each pane is a real terminal (ConPTY on Windows) drawn through `charmbracelet/x/vt`, and every key reaches the focused pane exactly as typed, whether it is Claude Code, Codex, `nvim` or a shell. Window actions sit behind a prefix, `ctrl+a`, as in herdr and tmux, so programs keep their keys.

## Drawing with half blocks

The office is drawn with half-block characters, because herdr panes only pass Kitty graphics and those do not exist in Windows Terminal. That way it works in any truecolor terminal. Writing color codes only when the color changes and drawing the background once per layout made each frame about 2.5 times cheaper, according to the changelog.

## A supervision clock and a pet

Whoever supervises agents rarely stops. I added a clock that counts supervision time, weighted by how many agents are working: at 50 minutes it suggests a break and at 90 it asks for confirmation before sending another prompt. The pet in the corner gets tired along with it and eats a fish for every task checked off on the board.

## Versioned releases

Every git tag triggers a release with GoReleaser: tests run and binaries come out for three systems on amd64 and arm64, with checksums. `bah upgrade` updates against those checksums. There are 63 test files, and `go vet` and `go test` run on every change.

## Pending

I have only used and tested it day to day on Windows with Claude Code. On macOS and Linux it builds and its tests pass, but it has not been used there. Other agents work in part: Codex starts, but the desks, states and spend come only from Claude Code's transcripts. The layout for narrow terminals, such as a phone's, is still on a branch.
