# YouTube AutoPilot Hub

A unified web dashboard for batch uploading videos to YouTube with multi-channel support (Profiles) and automatic subtitle pairing.

## Features

- **Web Dashboard**: Drag-and-drop interface for easier file management.
- **Multi-Profile Support**: Switch between different YouTube channels (e.g., Gaming, Vlog) seamlessly.
- **Auto Subtitle Pairing**: Automatically detects and uploads matching `.srt` or `.vtt` files.
- **Direct OAuth Integration**: Securely login with your Google account directly from the browser.
- **Resumable Uploads**: Uses YouTube's resumable upload protocol for large files.
- **Real-time Progress**: Visual progress bars and logs.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Python, FastAPI, Google API Client
- **Authentication**: OAuth 2.0 (Google web application flow)

## Setup

### Prerequisites

- Node.js (v16+)
- Python (3.8+)
- Google Cloud Project with YouTube Data API v3 enabled

### 1. Configuration

1. Create a `backend/.env` file based on `backend/.env.example`.
2. Fill in your Google OAuth Client ID and Secret.
   - **Redirect URI**: `http://localhost:8000/api/auth/callback`

### 2. Installation

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

**Frontend:**
```bash
# In the root directory
npm install
```

### 3. Running

**Start Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Start Frontend:**
```bash
# In a new terminal
npm run dev
```

Visit `http://localhost:3000` to start uploading!
