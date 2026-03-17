# Gemini Model Default

Chrome extension that automatically selects your preferred model on [gemini.google.com](https://gemini.google.com).

Gemini defaults to whatever model was last used, which can vary across sessions and conversations. This extension enforces your chosen model on every page load and new conversation turn — while still respecting manual switches mid-conversation.

## Features

- **Configurable default model** — pick from Gemini 3, Fast, Thinking, or Pro via the extension popup
- **Smart enforcement** — switches on page load and new turns, but respects manual model changes within a conversation
- **Optional toast notifications** — toggle on/off in the popup
- **SPA-aware** — detects client-side navigation between chats
- **Skips non-chat pages** — settings, gems, and extensions pages are left alone

## Install

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the cloned directory
5. Click the extension icon to pick your default model

## How It Works

A content script polls for the model selector button on Gemini's UI. If the current model doesn't match your preference, it opens the model dropdown and selects the correct one. User clicks on the model switcher are tracked so manual overrides aren't fought — the override resets on navigation or when a new conversation turn is detected.
