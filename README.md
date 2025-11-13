# Ukraine Alert AI Bot

Production-ready Telegram bot that monitors Ukrainian OSINT channels, analyzes new posts with Gemini 2.5 Flash, and delivers structured threat alerts to configured chats.

## Features
- Telethon micro-parser streams fresh posts from public channels and authenticates through the bot itself (phone + OTP).
- Node.js service analyzes each message with Gemini, deduplicates via SQLite, and fans out alerts only for relevant or global threats.
- Admins can update the analyst prompt, monitored regions, and Telethon login flow through Telegram commands.
- Persistent JSON settings keep runtime configuration in `data/` without needing code edits.
- Automatic parser restarts plus proactive admin notifications for OTP/phone/authorization states.

## Prerequisites
- Node.js 18+
- Python 3.10+
- Telegram Bot token (`BotFather`).
- Telegram API credentials (https://my.telegram.org/apps).
- Gemini API key.
- Telegram account capable of joining the monitored channels (for Telethon parser).

## Setup
1. Install dependencies:
   ```bash
   npm install
   pip install telethon
   ```
2. Create `.env` (see [.env](./.env)) and fill:
   ```env
   TELEGRAM_BOT_TOKEN=123:ABC
   TELEGRAM_TARGET_CHAT_IDS=123456789,-100987654321
   TELEGRAM_ADMIN_CHAT_IDS=123456789
   GEMINI_KEY=your_gemini_key
   API_ID=telegram_api_id
   API_HASH=telegram_api_hash
   TELEGRAM_2FA_PASSWORD=optional_if_enabled
   ```
3. Start the bot:
   ```bash
   npm start
   ```
4. In Telegram, send the commands below to the bot from an admin chat to complete authentication:
   - `/setphone +380XXXXXXXXX` – saves the Telegram account phone number.
   - Wait for Telegram to deliver the login code to that account, then `/setotp 12345` – forwards OTP to the parser.
   - The parser stores a Telethon session under `data/` so future restarts skip OTP unless Telegram requests it again.

## Admin Commands
All commands require the chat ID to be listed in `TELEGRAM_ADMIN_CHAT_IDS` (falls back to `TELEGRAM_TARGET_CHAT_IDS` if omitted).

| Command | Description |
| --- | --- |
| `/help` | Show the quick reference for available commands. |
| `/listregions` | Display the current region/city filter list. |
| `/addregion <name>` | Append a region or city to the monitored list. |
| `/removeregion <name>` | Remove a region/city. |
| `/prompt` | Display the current Gemini analyst prompt. |
| `/setprompt <text>` | Replace the system prompt used for Gemini analysis. |
| `/setphone <number>` | Store the Telegram account number for Telethon authentication. |
| `/setotp <code>` | Pass the received OTP directly to the parser. |
| `/status` | Show the most recent parser state (waiting for phone, OTP, ready, etc.). |

Settings are written to `data/settings.json` automatically. Regions/prompts update instantly without restarting the bot. Channel changes can be applied by editing `data/settings.json` manually and restarting the Node.js process.

## Testing
Deterministic Vitest suites cover the threat-filtering utilities and dynamic settings store. Run them with:
```bash
npm test
```

## Architecture Overview
```
┌────────────┐     spawn/stdin/out     ┌──────────────┐
│ Node Bot   │ ─────────────────────▶ │ Telethon     │
│ (index.js) │ ◀───────────────────── │ Parser       │
└────────────┘                         └──────────────┘
      │                                       │
      ▼                                       ▼
┌──────────────┐                     ┌────────────────┐
│ Gemini 2.5   │                     │ SQLite cache   │
└──────────────┘                     └────────────────┘
```

## Notes
- Alerts are suppressed for duplicate message IDs thanks to SQLite cache.
- Settings and OTP codes are stored under `data/` and auto-created if missing. The folder is ignored by git to avoid leaking secrets.
- The parser notifies admins whenever it needs phone/OTP input and restarts automatically when it exits.
