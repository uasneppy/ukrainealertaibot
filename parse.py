import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError

API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")

if not API_ID or not API_HASH:
  raise RuntimeError("API_ID and API_HASH must be provided via environment variables")

API_ID = int(API_ID)

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).parent / "data"))
SETTINGS_PATH = Path(os.getenv("SETTINGS_PATH", DATA_DIR / "settings.json"))
OTP_PATH = Path(os.getenv("OTP_PATH", DATA_DIR / "otp.json"))
SESSION_PATH = Path(os.getenv("TELETHON_SESSION_PATH", DATA_DIR / "telegram_parser"))

logging.getLogger("telethon").setLevel(logging.WARNING)
DATA_DIR.mkdir(parents=True, exist_ok=True)

LAST_STAGE = None


def emit(payload):
  sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
  sys.stdout.flush()


def emit_stage(stage, message):
  global LAST_STAGE
  if LAST_STAGE == stage:
    return
  LAST_STAGE = stage
  emit({"type": "status", "status": "auth_status", "stage": stage, "message": message})


def emit_ready(message):
  global LAST_STAGE
  LAST_STAGE = "ready"
  emit({"type": "status", "status": "ready", "message": message})


def emit_error(message):
  emit({"type": "status", "status": "error", "message": message})


def read_settings():
  if not SETTINGS_PATH.exists():
    return {}
  try:
    return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
  except json.JSONDecodeError:
    return {}


def read_otp():
  if not OTP_PATH.exists():
    return None
  try:
    payload = json.loads(OTP_PATH.read_text(encoding="utf-8"))
  except json.JSONDecodeError:
    return None
  code = payload.get("otp")
  if code:
    OTP_PATH.write_text(json.dumps({"otp": None, "updatedAt": payload.get("updatedAt")}, ensure_ascii=False), encoding="utf-8")
    return str(code).strip()
  return None


async def wait_for_phone():
  while True:
    phone = read_settings().get("phoneNumber")
    if phone:
      return str(phone)
    emit_stage("phone", "Надішліть /setphone у боті, щоб ввести номер Telegram")
    await asyncio.sleep(3)


async def wait_for_otp():
  emit_stage("otp", "Очікується OTP з /setotp у боті")
  while True:
    code = read_otp()
    if code:
      return code
    await asyncio.sleep(2)


async def authenticate(client):
  await client.connect()
  if await client.is_user_authorized():
    emit_ready("Сесія Telegram вже авторизована")
    return

  phone_number = await wait_for_phone()
  emit_stage("otp", "Відправлено код підтвердження. Введіть його через /setotp")
  await client.send_code_request(phone_number)
  code = await wait_for_otp()
  try:
    await client.sign_in(phone=phone_number, code=code)
  except SessionPasswordNeededError:
    password = os.getenv("TELEGRAM_2FA_PASSWORD")
    if not password:
      emit_error("Потрібен пароль двофакторної авторизації TELEGRAM_2FA_PASSWORD")
      raise
    await client.sign_in(password=password)
  emit_ready("Parser authenticated and streaming")


async def main():
  raw_input = sys.stdin.read().strip()
  channels = json.loads(raw_input) if raw_input else []

  client = TelegramClient(str(SESSION_PATH), API_ID, API_HASH)

  @client.on(events.NewMessage(chats=channels or None))
  async def handler(event):
    message = event.message
    chat = await event.get_chat()
    payload = {
      "id": str(message.id),
      "channel": getattr(chat, "username", None) or getattr(chat, "title", None) or str(event.chat_id),
      "text": message.message or "",
      "date": message.date.isoformat()
    }
    emit({"type": "message", "data": payload})

  try:
    await authenticate(client)
  except Exception as exc:  # pragma: no cover - defensive
    emit_error(f"Не вдалося авторизуватися: {exc}")
    return

  await client.run_until_disconnected()


if __name__ == "__main__":
  try:
    asyncio.run(main())
  except KeyboardInterrupt:
    pass
