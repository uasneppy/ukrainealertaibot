import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError
from telethon.errors.rpcerrorlist import (
  ChannelInvalidError,
  ChannelPrivateError,
  PeerIdInvalidError,
  UsernameNotOccupiedError
)

API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")

if not API_ID or not API_HASH:
  raise RuntimeError("API_ID and API_HASH must be provided via environment variables")

API_ID = int(API_ID)

def _read_concurrency_env():
  value = os.getenv("CHANNEL_RESOLUTION_CONCURRENCY", "5")
  try:
    parsed = int(value)
  except (TypeError, ValueError):
    return 5
  return max(1, parsed)


CHANNEL_RESOLUTION_CONCURRENCY = _read_concurrency_env()

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


def strip_telegram_url(value):
  lower_value = value.lower()
  if "t.me/" not in lower_value:
    return value
  prefix_index = lower_value.find("t.me/")
  truncated = value[prefix_index + len("t.me/") :]
  truncated = truncated.split("?", 1)[0]
  truncated = truncated.split("/", 1)[0]
  return truncated


def normalize_channel(name):
  if name is None:
    return None
  value = str(name).strip()
  if not value:
    return None
  value = strip_telegram_url(value)
  while value.startswith("@"):
    value = value[1:]
  value = value.lower()
  return value or None


def channel_query_value(name, normalized=None):
  normalized = normalized if normalized is not None else normalize_channel(name)
  if not normalized:
    return None
  if normalized.lstrip("-").isdigit():
    try:
      return int(normalized)
    except ValueError:
      return normalized
  return normalized


async def resolve_channel_filters(client, channels, concurrency_limit=CHANNEL_RESOLUTION_CONCURRENCY):
  resolved_chats = []
  allowed_channels = set()
  skipped = []
  seen = set()
  queue = []

  for raw_value in channels:
    normalized = normalize_channel(raw_value)
    if not normalized or normalized in seen:
      continue
    seen.add(normalized)

    query_value = channel_query_value(raw_value, normalized)
    if query_value is None:
      skipped.append({"channel": raw_value, "reason": "Unsupported channel format"})
      continue

    queue.append((raw_value, normalized, query_value))

  if not queue:
    return resolved_chats, allowed_channels, skipped

  semaphore = asyncio.Semaphore(max(1, concurrency_limit))

  async def resolve_single(raw_value, normalized, query_value):
    try:
      async with semaphore:
        entity = await client.get_input_entity(query_value)
    except (ValueError, UsernameNotOccupiedError, ChannelInvalidError, ChannelPrivateError, PeerIdInvalidError) as exc:
      skipped.append({"channel": raw_value, "reason": str(exc)})
      return

    resolved_chats.append(entity)
    allowed_channels.add(normalized)

  await asyncio.gather(*(resolve_single(*entry) for entry in queue))

  return resolved_chats, allowed_channels, skipped


async def main():
  raw_input = sys.stdin.read().strip()
  channels = json.loads(raw_input) if raw_input else []

  client = TelegramClient(str(SESSION_PATH), API_ID, API_HASH)

  try:
    await authenticate(client)
  except Exception as exc:  # pragma: no cover - defensive
    emit_error(f"Не вдалося авторизуватися: {exc}")
    return

  allowed_channels = set()
  event_filter = events.NewMessage()

  if channels:
    resolved_chats, allowed_channels, skipped_channels = await resolve_channel_filters(
      client,
      channels
    )

    if skipped_channels:
      emit({
        "type": "status",
        "status": "channel_warning",
        "message": "Деякі канали пропущено: перевірте налаштування",
        "skippedChannels": skipped_channels
      })

    if not resolved_chats:
      emit_error("Жодного валідного каналу не знайдено. Оновіть whitelist у налаштуваннях.")
      return

    event_filter = events.NewMessage(chats=resolved_chats)

  @client.on(event_filter)
  async def handler(event):
    message = event.message
    chat = await event.get_chat()
    channel_name = getattr(chat, "username", None) or getattr(chat, "title", None) or str(getattr(chat, "id", None) or event.chat_id)

    normalized_candidates = [
      normalize_channel(getattr(chat, "username", None)),
      normalize_channel(getattr(chat, "title", None)),
      normalize_channel(getattr(chat, "first_name", None)),
      normalize_channel(getattr(chat, "last_name", None)),
      normalize_channel(getattr(chat, "id", None)),
      normalize_channel(event.chat_id)
    ]

    if allowed_channels:
      if not any(candidate in allowed_channels for candidate in normalized_candidates if candidate):
        return

    payload = {
      "id": str(message.id),
      "channel": channel_name,
      "text": message.message or "",
      "date": message.date.isoformat()
    }
    emit({"type": "message", "data": payload})

  await client.run_until_disconnected()


if __name__ == "__main__":
  try:
    asyncio.run(main())
  except KeyboardInterrupt:
    pass
