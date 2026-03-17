# Gemini Model Default

Chrome extension that automatically selects your preferred model on [gemini.google.com](https://gemini.google.com).

Gemini often silently switches your model between conversations. This extension enforces your chosen default (Pro, Fast, or Thinking) while respecting your manual selections.

## Features

- **Default model enforcement** — automatically switches to your preferred model on page load and new conversation turns
- **Respects manual changes** — if you switch models yourself, the extension won't fight it
- **Remember my choice** — optionally persist your manual model selection across conversations
- **Enable/disable toggle** — quickly turn the extension on or off without uninstalling
- **Optional notifications** — toast alerts when the model is switched
- **Focus preservation** — model switching won't interrupt your typing
- **SPA-aware** — detects client-side navigation between chats
- **Skips non-chat pages** — settings, gems, and extensions pages are left alone
- **No data collection** — all preferences stored locally via chrome.storage.sync

## Install

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the cloned directory
5. Click the extension icon to configure your default model
