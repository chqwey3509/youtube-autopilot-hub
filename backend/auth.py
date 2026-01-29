"""
OAuth 2.0 Authentication Module
================================
Handles Google OAuth flow for YouTube API access.
Supports multiple user profiles (channels).
"""

import os
import json
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

router = APIRouter()

# OAuth 2.0 Configuration
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl"  # Required for captions
]

TOKENS_DIR = Path(__file__).parent / "tokens"
TOKENS_DIR.mkdir(exist_ok=True)

# In-memory session storage (for demo; use Redis in production)
pending_auth_sessions = {}


def get_oauth_config():
    """Get OAuth config from environment variables"""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
        )
    
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [f"{os.getenv('BACKEND_URL', 'http://localhost:8000')}/api/auth/callback"]
        }
    }


def get_token_path(profile: str) -> Path:
    """Get token file path for a specific user profile"""
    # Sanitize profile name to prevent path traversal
    safe_profile = "".join(c for c in profile if c.isalnum() or c in "_-")
    return TOKENS_DIR / f"token_{safe_profile}.json"


def load_credentials(profile: str) -> Optional[Credentials]:
    """Load stored credentials for a profile"""
    token_path = get_token_path(profile)
    
    if not token_path.exists():
        return None
    
    try:
        with open(token_path, "r") as f:
            token_data = json.load(f)
        
        creds = Credentials.from_authorized_user_info(token_data, SCOPES)
        
        # Refresh if expired
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            save_credentials(profile, creds)
        
        return creds if creds and creds.valid else None
    except Exception as e:
        print(f"Error loading credentials: {e}")
        return None


def save_credentials(profile: str, creds: Credentials):
    """Save credentials to file"""
    token_path = get_token_path(profile)
    
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
        "expiry": creds.expiry.isoformat() if creds.expiry else None
    }
    
    with open(token_path, "w") as f:
        json.dump(token_data, f, indent=2)


@router.get("/login")
async def login(profile: str = Query(default="default", description="User profile name")):
    """
    Start OAuth 2.0 login flow.
    Redirects user to Google's consent screen.
    """
    try:
        config = get_oauth_config()
        backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
        
        flow = Flow.from_client_config(
            config,
            scopes=SCOPES,
            redirect_uri=f"{backend_url}/api/auth/callback"
        )
        
        authorization_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent"  # Force consent to get refresh_token
        )
        
        # Store state -> profile mapping
        pending_auth_sessions[state] = {
            "profile": profile,
            "created_at": datetime.now().isoformat()
        }
        
        return RedirectResponse(url=authorization_url)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/callback")
async def callback(code: str = None, state: str = None, error: str = None):
    """
    OAuth 2.0 callback handler.
    Google redirects here after user grants permission.
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    if error:
        return RedirectResponse(url=f"{frontend_url}?auth_error={error}")
    
    if not code or not state:
        return RedirectResponse(url=f"{frontend_url}?auth_error=missing_params")
    
    # Get profile from state
    session_data = pending_auth_sessions.pop(state, None)
    if not session_data:
        return RedirectResponse(url=f"{frontend_url}?auth_error=invalid_state")
    
    profile = session_data["profile"]
    
    try:
        config = get_oauth_config()
        backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
        
        flow = Flow.from_client_config(
            config,
            scopes=SCOPES,
            redirect_uri=f"{backend_url}/api/auth/callback"
        )
        
        # Exchange authorization code for credentials
        flow.fetch_token(code=code)
        creds = flow.credentials
        
        # Save credentials
        save_credentials(profile, creds)
        
        # Redirect back to frontend with success
        return RedirectResponse(url=f"{frontend_url}?auth_success=true&profile={profile}")
    
    except Exception as e:
        print(f"OAuth callback error: {e}")
        return RedirectResponse(url=f"{frontend_url}?auth_error={str(e)}")


@router.get("/status")
async def auth_status(profile: str = Query(default="default")):
    """
    Check authentication status for a profile.
    Returns channel info if authenticated.
    """
    creds = load_credentials(profile)
    
    if not creds:
        return {
            "authenticated": False,
            "profile": profile,
            "channel": None
        }
    
    try:
        # Get channel info
        youtube = build("youtube", "v3", credentials=creds)
        response = youtube.channels().list(
            part="snippet",
            mine=True
        ).execute()
        
        if response.get("items"):
            channel = response["items"][0]["snippet"]
            return {
                "authenticated": True,
                "profile": profile,
                "channel": {
                    "title": channel.get("title"),
                    "thumbnail": channel.get("thumbnails", {}).get("default", {}).get("url")
                }
            }
        else:
            return {
                "authenticated": True,
                "profile": profile,
                "channel": None
            }
    
    except Exception as e:
        print(f"Error getting channel info: {e}")
        return {
            "authenticated": False,
            "profile": profile,
            "channel": None,
            "error": str(e)
        }


@router.get("/profiles")
async def list_profiles():
    """List all saved profiles/tokens"""
    profiles = []
    
    for token_file in TOKENS_DIR.glob("token_*.json"):
        profile_name = token_file.stem.replace("token_", "")
        creds = load_credentials(profile_name)
        
        profiles.append({
            "name": profile_name,
            "authenticated": creds is not None and creds.valid
        })
    
    return {"profiles": profiles}


@router.post("/logout")
async def logout(profile: str = Query(default="default")):
    """Remove stored credentials for a profile"""
    token_path = get_token_path(profile)
    
    if token_path.exists():
        token_path.unlink()
        return {"success": True, "message": f"Logged out from profile: {profile}"}
    
    return {"success": True, "message": "No credentials to remove"}
