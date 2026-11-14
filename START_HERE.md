# Start here

This folder is everything a new Claude session needs to build a space mission design game like "Last Signal from Ceruvia" from scratch. There's no game code in it, only the instructions, design and numbers.

## What's in the folder

| File | What it is |
|---|---|
| `START_HERE.md` | This page (for you) |
| `CLAUDE.md` | Instructions Claude Code reads on its own when it opens this folder |
| `PROMPT.md` | The full brief: 11 build steps |
| `GUIDE.md` | Rules and how-tos |
| `ARCHITECTURE.md` | How the code is organized |
| `ENGINEERING_MODEL.md` | All the formulas |
| `GAME_DESIGN.md` | Missions, minigames, beginner mode, fun features |
| `DATA_REFERENCE.md` | Starting numbers for parts, rockets and missions |
| `MULTIPLAYER.md` | Online co-op |
| `TESTING.md` | How to test each step |
| `COMPLIANCE.md` | Space Apps rules checklist |

## Option 1: Claude Code (best)

1. Copy this whole folder and rename the copy to your new game's name, so this kit stays clean for next time.
2. In the Claude desktop app, open a new **Code** session and pick that folder.
3. Turn on **plan mode** and send:

> Read CLAUDE.md and every file it lists. Then build the game from scratch in this folder, following PROMPT.md. Show me your plan for all 11 steps first.

4. Approve the plan, then go step by step: after each one it tests, commits and asks before going on. Reply "next step" to keep going, or give feedback.

## Option 2: Uploading files to a Claude chat

Upload all 11 `.md` files and send:

> These files are a build kit. Read CLAUDE.md first, then the files it lists. Follow PROMPT.md to build the game step by step, starting with step 1. Give me each file in full.

A chat can't run a server or test the game for you, so it's slower. Use Claude Code if you can.

## Changing the game

Add your changes to the first message, for example:
- "Use a new story: a lost rover on Titan instead of the Ceruvia signal."
- "Keep the same story but rename everything."
- "Skip online co-op for now (step 9)."

## Good to know

- **Online play** needs your own free Firebase project. Claude will walk you through it at step 9. Until then, `?local` mode lets two tabs in one browser play together.
- **Hosting**: when you're ready, ask Claude to create a GitHub repo, push and turn on GitHub Pages. It will ask before doing it.
- **Space Apps**: if this is for a hackathon entry, read `COMPLIANCE.md`, especially the timing rule, and check with your Local Lead.
