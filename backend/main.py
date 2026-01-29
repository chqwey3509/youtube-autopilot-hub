"""
YouTube AutoPilot Hub - FastAPI Backend
========================================
Handles OAuth 2.0 authentication and YouTube video/caption uploads.

Run with: uvicorn main:app --reload --port 8000
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Load environment variables
load_dotenv()

# Import routers
from auth import router as auth_router
from upload import router as upload_router

# Create FastAPI app
app = FastAPI(
    title="YouTube AutoPilot Hub API",
    description="Backend API for YouTube batch video uploads with subtitle support",
    version="1.0.0"
)

# CORS configuration - allow frontend to access API
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    os.getenv("FRONTEND_URL", "http://localhost:3000")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tokens directory if it doesn't exist
tokens_dir = Path(__file__).parent / "tokens"
tokens_dir.mkdir(exist_ok=True)

# Include routers
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(upload_router, prefix="/api", tags=["Upload"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "YouTube AutoPilot Hub API",
        "version": "1.0.0"
    }


@app.get("/api/health")
async def health_check():
    """API health check"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
