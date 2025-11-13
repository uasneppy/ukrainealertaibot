import asyncio
import json
import os
import sys
from telethon import TelegramClient, events

API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")

if not API_ID or not API_HASH:
  raise RuntimeError("API_ID and API_HASH must be provided via environment variables")

API_ID = int(API_ID)

async def main():
  raw_input = sys.stdin.read().strip()
  channels = json.loads(raw_input) if raw_input else []

  client = TelegramClient("telegram_parser", API_ID, API_HASH)

  @client.on(events.NewMessage(chats=channels or None))
  async def handler(event):
    message = event.message
    payload = {
      "id": str(message.id),
      "channel": event.chat.username or event.chat.title or str(event.chat_id),
      "text": message.message or "",
      "date": message.date.isoformat()
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()

  await client.start()
  await client.run_until_disconnected()

if __name__ == "__main__":
  try:
    asyncio.run(main())
  except KeyboardInterrupt:
    pass
