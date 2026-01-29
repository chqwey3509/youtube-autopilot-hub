export const REQUIREMENTS_TXT = `google-api-python-client
google-auth-oauthlib
google-auth-httplib2
tqdm
`;

export const PYTHON_SCRIPT = `#!/usr/bin/env python3
"""
YouTube Batch Uploader CLI
Author: Automation Engineer
Description: Uploads videos and matching subtitles to YouTube channels with multi-user support.
"""

import argparse
import os
import sys
import glob
import logging
import pickle
from pathlib import Path
from typing import Optional

# Third-party imports
from tqdm import tqdm
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

# Constants
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly"
]
CLIENT_SECRETS_FILE = "client_secrets.json"
MISSING_CLIENT_SECRETS_MESSAGE = \"\"\"
[ERROR] client_secrets.json not found.
Please enable the YouTube Data API v3 in Google Cloud Console,
download the OAuth 2.0 Client credentials, and save them as 'client_secrets.json'
in this directory.
\"\"\"

# Configure Logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

class YouTubeUploader:
    def __init__(self, user_profile: str):
        self.user_profile = user_profile
        self.credentials = self._authenticate()
        self.youtube = build("youtube", "v3", credentials=self.credentials)

    def _authenticate(self):
        """Handles OAuth 2.0 authentication with multi-user token management."""
        creds = None
        # Dynamic token file based on user profile
        token_file = f"token_{self.user_profile}.pickle"

        if os.path.exists(token_file):
            logger.info(f"[INFO] Loading credentials for user: {self.user_profile}")
            with open(token_file, "rb") as token:
                creds = pickle.load(token)

        # Refresh or Create new credentials
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                logger.info("[INFO] Refreshing expired token...")
                creds.refresh(Request())
            else:
                logger.info(f"[INFO] No valid token found for '{self.user_profile}'. Starting login flow...")
                if not os.path.exists(CLIENT_SECRETS_FILE):
                    print(MISSING_CLIENT_SECRETS_MESSAGE)
                    sys.exit(1)
                
                flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
                creds = flow.run_local_server(port=0)

            # Save credentials
            with open(token_file, "wb") as token:
                pickle.dump(creds, token)
                logger.info(f"[INFO] Credentials saved to {token_file}")

        return creds

    def upload_video(self, file_path: Path) -> Optional[str]:
        """Uploads a video file with a progress bar."""
        title = file_path.stem  # Filename without extension
        logger.info(f"\\n[UPLOAD] Processing: {file_path.name}")
        
        body = {
            "snippet": {
                "title": title,
                "description": f"Uploaded via CLI automation. Source: {file_path.name}",
                "categoryId": "22"  # People & Blogs
            },
            "status": {
                "privacyStatus": "private"  # Safety first
            }
        }

        # Resumable upload for large files
        media = MediaFileUpload(
            str(file_path),
            chunksize=1024*1024,
            resumable=True
        )

        request = self.youtube.videos().insert(
            part="snippet,status",
            body=body,
            media_body=media
        )

        response = None
        
        # Setup progress bar
        file_size = file_path.stat().st_size
        pbar = tqdm(total=file_size, unit='B', unit_scale=True, desc="Uploading")

        previous_progress = 0
        
        while response is None:
            try:
                status, response = request.next_chunk()
                if status:
                    current_progress = int(status.resumable_progress)
                    pbar.update(current_progress - previous_progress)
                    previous_progress = current_progress
            except HttpError as e:
                if e.resp.status == 403:
                    logger.error("[ERROR] Quota exceeded.")
                    sys.exit(1)
                elif e.resp.status in [500, 502, 503, 504]:
                    logger.warning("[WARNING] Network error, retrying chunk...")
                    continue
                else:
                    logger.error(f"[ERROR] HTTP Error: {e}")
                    raise
            except Exception as e:
                 logger.error(f"[ERROR] Unexpected error: {e}")
                 sys.exit(1)

        pbar.close()
        
        if "id" in response:
            video_id = response["id"]
            logger.info(f"[SUCCESS] Video uploaded. ID: {video_id}")
            return video_id
        else:
            logger.error("[ERROR] Upload failed, no ID returned.")
            return None

    def upload_caption(self, video_id: str, caption_path: Path, language: str = "zh-TW"):
        """Uploads a caption file for a given video ID."""
        logger.info(f"[INFO] Found subtitle: {caption_path.name}. Uploading...")
        
        body = {
            "snippet": {
                "videoId": video_id,
                "language": language,
                "name": f"Default ({language})"
            }
        }
        
        media = MediaFileUpload(str(caption_path))
        
        try:
            self.youtube.captions().insert(
                part="snippet",
                body=body,
                media_body=media
            ).execute()
            logger.info(f"[SUCCESS] Subtitle {caption_path.name} attached to Video {video_id}.")
        except HttpError as e:
            logger.error(f"[ERROR] Failed to upload caption: {e}")

def main():
    parser = argparse.ArgumentParser(description="YouTube Batch Uploader CLI")
    parser.add_argument("--user", type=str, default="default", help="User profile name for authentication switching")
    parser.add_argument("--folder", type=str, default=".", help="Directory containing videos to upload")
    
    args = parser.parse_args()
    
    # Validate folder
    target_dir = Path(args.folder)
    if not target_dir.exists():
        logger.error(f"[ERROR] Directory '{args.folder}' does not exist.")
        sys.exit(1)

    # Initialize Uploader with user profile
    uploader = YouTubeUploader(args.user)
    
    # Find videos
    video_extensions = {".mp4", ".mov", ".mkv", ".avi"}
    video_files = [
        f for f in target_dir.iterdir() 
        if f.suffix.lower() in video_extensions and f.is_file()
    ]
    
    if not video_files:
        logger.info("[INFO] No video files found in target directory.")
        return

    logger.info(f"[INFO] Found {len(video_files)} videos to process.")
    
    for video in video_files:
        video_id = uploader.upload_video(video)
        
        if video_id:
            # Check for matching subtitle (same stem, typical sub extensions)
            for sub_ext in [".srt", ".vtt"]:
                sub_file = video.with_suffix(sub_ext)
                if sub_file.exists():
                    uploader.upload_caption(video_id, sub_file)
                    break

if __name__ == "__main__":
    main()
`;