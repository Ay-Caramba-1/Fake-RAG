# FakeRAG - Keyword Search Extension for SillyTavern

A lightweight alternative to vector embeddings that uses **literal keyword search** with Groq-powered keyword extraction.

## 🎯 What does it do?

Instead of using expensive vector embeddings, FakeRAG:

1. **Extracts keywords** from your messages using Groq's fast LLMs
2. **Searches literally** through your Data Bank files for exact keyword matches
3. **Injects relevant context** into your prompts, just like regular RAG

**Result:** Your characters remember everything with perfect accuracy - names, dates, specific details that vector search might miss.

## ✨ Features

- 🔍 **Literal keyword search** - No semantic guessing, finds exact matches
- ⚡ **Fast Groq integration** - Uses Groq's speedy models for keyword extraction
- 🔑 **Flexible API key** - Use your own Groq key or SillyTavern's stored key
- 📊 **Configurable limits** - Control context padding, max results, and injection size
- 🔄 **Auto-clear cache** - Automatically clears when switching characters
- 💾 **No server dependencies** - Runs entirely in the browser

## 📦 Installation

### Via SillyTavern Extension Installer

1. Open SillyTavern
2. Go to **Extensions** → **Install Extension**
3. Paste this URL:
```
https://github.com/Ay-Caramba-1/Fake-RAG
```

### Manual Installation

1. Download or clone this repository
2. Copy the folder to: `SillyTavern/public/scripts/extensions/third-party/Extension-FakeRAG`
3. Restart SillyTavern

## 🚀 How to Use

1. **Configure Groq API Key:**
   - Either add your Groq key in SillyTavern's API settings
   - Or enter it directly in FakeRAG settings (takes priority)

2. **Select FakeRAG as Vectorization Source:**
   - Go to **Extensions** → **Vector Storage**
   - In the "Vectorization Source" dropdown, select **🔍 FakeRAG (Keyword Search)**

3. **Add files to Data Bank:**
   - Upload your lore files, character backgrounds, world info, etc.
   - Click "Vectorize All" to load them into FakeRAG

4. **Chat:**
   - FakeRAG will automatically extract keywords from messages
   - It searches your files and injects matching context

## ⚙️ Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Max Injection Chars** | Maximum characters to inject into prompt | 75000 |
| **Context Padding** | Characters of context around each match | 1200 |
| **Max Results** | Maximum number of search results | 5 |
| **Min/Max Keyword Length** | Filter keywords by length | 2-30 |
| **Auto-clear cache** | Clear cache when changing characters | ✓ |

## 🔧 Requirements

- SillyTavern (latest version recommended)
- Groq API key (free tier available at [console.groq.com](https://console.groq.com))

## 📝 How it Works

```
User sends message
        ↓
Groq extracts keywords (e.g., "princess, knight, secret")
        ↓
FakeRAG searches Data Bank files for exact matches
        ↓
Matching text fragments + context are collected
        ↓
Results are injected into the prompt (respecting char limit)
        ↓
AI sees relevant context and responds accordingly
```

## 🆚 FakeRAG vs Real Vectorization

| Feature | FakeRAG | Vector Embeddings |
|---------|---------|-------------------|
| **Accuracy** | Literal matches | Semantic similarity |
| **Speed** | Fast (no embeddings) | Slower (embedding generation) |
| **Names/Dates** | Perfect recall | May miss specific terms |
| **Server needs** | None (browser only) | Embedding API required |
| **Cost** | Just Groq (cheap/free) | Embedding API costs |

## � License

### 🍕 The Pizza License v1.0

This software is provided under the following terms:

**To use, modify, or distribute this extension, you must:**

1. Contact **Klaus** on Discord
2. Send a photo of a **REAL pizza** that you made, bought, or are currently eating
3. The photo must be **original** (no Google Images, no stock photos, no AI-generated pizzas)
4. Wait for approval

**Proof of pizza is non-negotiable.** Screenshots of pizza orders do not count. Frozen pizza is acceptable but frowned upon. Pineapple will be rejected.

For contact: **rentry.org/stable-proxy**

## 🙏 Credits

- Created by **Klaus** - [rentry.org/stable-proxy](https://rentry.org/stable-proxy)
- Inspired by the concept of "literal RAG" vs semantic RAG
- Built for SillyTavern community
