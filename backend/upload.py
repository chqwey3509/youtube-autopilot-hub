"""
YouTube Upload Module
======================
Handles video and caption uploads to YouTube.
Supports resumable uploads for large files.
"""

import os
import json
import uuid
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, BackgroundTasks
from fastapi.responses import JSONResponse
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload
from googleapiclient.errors import HttpError
import aiofiles

router = APIRouter()

# Upload jobs storage (in-memory for demo; use Redis in production)
upload_jobs: Dict[str, Dict[str, Any]] = {}

# Temporary upload directory
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

TOKENS_DIR = Path(__file__).parent / "tokens"

# Supported file extensions
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".wmv", ".flv", ".webm"}
SUBTITLE_EXTENSIONS = {".srt", ".vtt", ".sbv", ".sub", ".ass"}


def load_credentials(profile: str) -> Optional[Credentials]:
    """Load stored credentials for a profile"""
    from auth import load_credentials as auth_load_credentials
    return auth_load_credentials(profile)


def get_youtube_client(profile: str):
    """Get authenticated YouTube API client"""
    creds = load_credentials(profile)
    
    if not creds:
        raise HTTPException(
            status_code=401,
            detail=f"Not authenticated. Please login first with profile: {profile}"
        )
    
    return build("youtube", "v3", credentials=creds)


async def save_upload_file(upload_file: UploadFile, destination: Path) -> Path:
    """Save uploaded file to disk"""
    async with aiofiles.open(destination, 'wb') as out_file:
        content = await upload_file.read()
        await out_file.write(content)
    return destination


def upload_video_to_youtube(
    youtube,
    video_path: Path,
    title: str,
    description: str = "",
    privacy: str = "private",
    category_id: str = "22",  # People & Blogs
    job_id: str = None
) -> Optional[str]:
    """
    Upload video to YouTube using resumable upload.
    Returns video ID on success.
    """
    body = {
        "snippet": {
            "title": title,
            "description": description or f"Uploaded via YouTube AutoPilot Hub on {datetime.now().strftime('%Y-%m-%d')}",
            "categoryId": category_id
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": False
        }
    }
    
    # Resumable upload for large files
    media = MediaFileUpload(
        str(video_path),
        chunksize=1024 * 1024,  # 1MB chunks
        resumable=True
    )
    
    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media
    )
    
    response = None
    file_size = video_path.stat().st_size
    
    while response is None:
        try:
            status, response = request.next_chunk()
            
            if status and job_id:
                progress = int(status.progress() * 100)
                upload_jobs[job_id]["video_progress"] = progress
                upload_jobs[job_id]["status"] = f"Uploading video... {progress}%"
        
        except HttpError as e:
            if e.resp.status == 403:
                raise HTTPException(
                    status_code=403,
                    detail="YouTube API quota exceeded. Please try again tomorrow."
                )
            elif e.resp.status in [500, 502, 503, 504]:
                # Retry on server errors
                asyncio.sleep(5)
                continue
            else:
                raise HTTPException(
                    status_code=e.resp.status,
                    detail=f"YouTube API error: {e.error_details}"
                )
    
    if response and "id" in response:
        return response["id"]
    
    return None


def upload_caption_to_youtube(
    youtube,
    video_id: str,
    caption_path: Path,
    language: str = "en",
    name: str = "English"
) -> bool:
    """
    Upload caption/subtitle file to YouTube.
    Returns True on success.
    """
    body = {
        "snippet": {
            "videoId": video_id,
            "language": language,
            "name": name,
            "isDraft": False
        }
    }
    
    media = MediaFileUpload(str(caption_path))
    
    try:
        youtube.captions().insert(
            part="snippet",
            body=body,
            media_body=media
        ).execute()
        return True
    
    except HttpError as e:
        print(f"Caption upload error: {e}")
        return False


async def process_upload_job(
    job_id: str,
    profile: str,
    video_path: Path,
    subtitle_path: Optional[Path],
    title: str,
    description: str,
    privacy: str,
    language: str
):
    """Background task to process video upload"""
    try:
        upload_jobs[job_id]["status"] = "Initializing..."
        
        # Get YouTube client
        youtube = get_youtube_client(profile)
        
        # Upload video
        upload_jobs[job_id]["status"] = "Uploading video..."
        video_id = upload_video_to_youtube(
            youtube=youtube,
            video_path=video_path,
            title=title,
            description=description,
            privacy=privacy,
            job_id=job_id
        )
        
        if not video_id:
            upload_jobs[job_id]["status"] = "error"
            upload_jobs[job_id]["error"] = "Failed to upload video"
            return
        
        upload_jobs[job_id]["video_id"] = video_id
        upload_jobs[job_id]["video_progress"] = 100
        upload_jobs[job_id]["status"] = "Video uploaded successfully"
        
        # Upload subtitle if provided
        if subtitle_path and subtitle_path.exists():
            upload_jobs[job_id]["status"] = "Uploading subtitle..."
            
            success = upload_caption_to_youtube(
                youtube=youtube,
                video_id=video_id,
                caption_path=subtitle_path,
                language=language
            )
            
            if success:
                upload_jobs[job_id]["subtitle_uploaded"] = True
                upload_jobs[job_id]["status"] = "Completed with subtitle"
            else:
                upload_jobs[job_id]["subtitle_uploaded"] = False
                upload_jobs[job_id]["status"] = "Completed (subtitle failed)"
        else:
            upload_jobs[job_id]["status"] = "Completed"
        
        upload_jobs[job_id]["completed"] = True
        upload_jobs[job_id]["video_url"] = f"https://youtu.be/{video_id}"
        
    except Exception as e:
        upload_jobs[job_id]["status"] = "error"
        upload_jobs[job_id]["error"] = str(e)
    
    finally:
        # Clean up temp files
        try:
            if video_path.exists():
                video_path.unlink()
            if subtitle_path and subtitle_path.exists():
                subtitle_path.unlink()
        except:
            pass


@router.post("/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(..., description="Video file to upload"),
    subtitle: Optional[UploadFile] = File(None, description="Subtitle file (SRT/VTT)"),
    profile: str = Form(default="default", description="User profile for authentication"),
    title: Optional[str] = Form(None, description="Video title (defaults to filename)"),
    description: str = Form(default="", description="Video description"),
    privacy: str = Form(default="private", description="Privacy status: private, unlisted, public"),
    language: str = Form(default="en", description="Subtitle language code")
):
    """
    Upload a video (and optional subtitle) to YouTube.
    Returns a job ID to track upload progress.
    """
    # Validate video file
    video_ext = Path(video.filename).suffix.lower()
    if video_ext not in VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format: {video_ext}. Supported: {VIDEO_EXTENSIONS}"
        )
    
    # Validate subtitle file if provided
    subtitle_path = None
    if subtitle:
        subtitle_ext = Path(subtitle.filename).suffix.lower()
        if subtitle_ext not in SUBTITLE_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported subtitle format: {subtitle_ext}. Supported: {SUBTITLE_EXTENSIONS}"
            )
    
    # Check authentication
    creds = load_credentials(profile)
    if not creds:
        raise HTTPException(
            status_code=401,
            detail=f"Not authenticated. Please login first with profile: {profile}"
        )
    
    # Generate job ID
    job_id = str(uuid.uuid4())
    
    # Save files to temp directory
    video_path = UPLOAD_DIR / f"{job_id}_{video.filename}"
    await save_upload_file(video, video_path)
    
    if subtitle:
        subtitle_path = UPLOAD_DIR / f"{job_id}_{subtitle.filename}"
        await save_upload_file(subtitle, subtitle_path)
    
    # Use filename as title if not provided
    video_title = title or Path(video.filename).stem
    
    # Initialize job status
    upload_jobs[job_id] = {
        "job_id": job_id,
        "profile": profile,
        "video_filename": video.filename,
        "subtitle_filename": subtitle.filename if subtitle else None,
        "title": video_title,
        "status": "queued",
        "video_progress": 0,
        "video_id": None,
        "video_url": None,
        "subtitle_uploaded": False,
        "completed": False,
        "error": None,
        "created_at": datetime.now().isoformat()
    }
    
    # Start background upload task
    background_tasks.add_task(
        process_upload_job,
        job_id=job_id,
        profile=profile,
        video_path=video_path,
        subtitle_path=subtitle_path,
        title=video_title,
        description=description,
        privacy=privacy,
        language=language
    )
    
    return {
        "job_id": job_id,
        "message": "Upload started",
        "status_url": f"/api/upload/status/{job_id}"
    }


@router.get("/upload/status/{job_id}")
async def get_upload_status(job_id: str):
    """Get the status of an upload job"""
    if job_id not in upload_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return upload_jobs[job_id]


@router.get("/upload/jobs")
async def list_upload_jobs(profile: Optional[str] = None):
    """List all upload jobs, optionally filtered by profile"""
    jobs = list(upload_jobs.values())
    
    if profile:
        jobs = [j for j in jobs if j.get("profile") == profile]
    
    # Sort by created_at descending
    jobs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {"jobs": jobs}


@router.delete("/upload/job/{job_id}")
async def delete_upload_job(job_id: str):
    """Delete a completed upload job from the list"""
    if job_id not in upload_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not upload_jobs[job_id].get("completed") and upload_jobs[job_id].get("status") != "error":
        raise HTTPException(status_code=400, detail="Cannot delete job in progress")
    
    del upload_jobs[job_id]
    return {"success": True, "message": "Job deleted"}
