# Ukraine Alert AI Bot

Production-ready Telegram bot that monitors Ukrainian OSINT channels, analyzes new posts with Gemini 2.5 Flash, and delivers structured threat alerts to configured chats.

## Features
- Telethon micro-parser streams fresh posts from specified public channels.
- Node.js service analyzes each message with Gemini and stores deduplication metadata in SQLite.
- Smart logic prevents hallucinations, filters by regions, and always warns about strategic/global threats.
- Configurable prompts, channels, and monitored regions.

## Prerequisites
- Node.js 18+
- Python 3.10+
- Telegram Bot token (`BotFather`).
- Telegram API credentials (https://my.telegram.org/apps).
- Gemini API key.

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
   GEMINI_KEY=your_gemini_key
   API_ID=telegram_api_id
   API_HASH=telegram_api_hash
   ```
3. Adjust monitored regions, channels, and analyst prompt in [`config.js`](./config.js).
4. Run the bot:
   ```bash
   npm start
   ```

## Testing
The project includes deterministic Vitest suites for core utilities. Run them with:
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
- All Gemini prompts live in `config.js` for quick updates.
- Parser restarts manually if it stops (see console logs).
