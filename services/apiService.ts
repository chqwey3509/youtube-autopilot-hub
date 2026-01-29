/**
 * API Service for YouTube AutoPilot Hub
 * Handles communication with the FastAPI backend
 */

const API_BASE = '/api';

// Types
export interface AuthStatus {
    authenticated: boolean;
    profile: string;
    channel: {
        title: string;
        thumbnail: string;
    } | null;
    error?: string;
}

export interface Profile {
    name: string;
    authenticated: boolean;
}

export interface UploadJob {
    job_id: string;
    profile: string;
    video_filename: string;
    subtitle_filename: string | null;
    title: string;
    status: string;
    video_progress: number;
    video_id: string | null;
    video_url: string | null;
    subtitle_uploaded: boolean;
    completed: boolean;
    error: string | null;
    created_at: string;
}

export interface UploadResponse {
    job_id: string;
    message: string;
    status_url: string;
}

// Auth APIs

export const getAuthStatus = async (profile: string = 'default'): Promise<AuthStatus> => {
    const response = await fetch(`${API_BASE}/auth/status?profile=${encodeURIComponent(profile)}`);
    if (!response.ok) {
        throw new Error('Failed to get auth status');
    }
    return response.json();
};

export const getProfiles = async (): Promise<Profile[]> => {
    const response = await fetch(`${API_BASE}/auth/profiles`);
    if (!response.ok) {
        throw new Error('Failed to get profiles');
    }
    const data = await response.json();
    return data.profiles;
};

export const login = (profile: string = 'default'): void => {
    // Redirect to OAuth login
    window.location.href = `${API_BASE}/auth/login?profile=${encodeURIComponent(profile)}`;
};

export const logout = async (profile: string = 'default'): Promise<void> => {
    await fetch(`${API_BASE}/auth/logout?profile=${encodeURIComponent(profile)}`, {
        method: 'POST'
    });
};

// Upload APIs

export const uploadVideo = async (
    video: File,
    subtitle: File | null,
    options: {
        profile?: string;
        title?: string;
        description?: string;
        privacy?: 'private' | 'unlisted' | 'public';
        language?: string;
    } = {}
): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('video', video);

    if (subtitle) {
        formData.append('subtitle', subtitle);
    }

    formData.append('profile', options.profile || 'default');

    if (options.title) {
        formData.append('title', options.title);
    }

    formData.append('description', options.description || '');
    formData.append('privacy', options.privacy || 'private');
    formData.append('language', options.language || 'en');

    const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
    }

    return response.json();
};

export const getUploadStatus = async (jobId: string): Promise<UploadJob> => {
    const response = await fetch(`${API_BASE}/upload/status/${jobId}`);

    if (!response.ok) {
        throw new Error('Failed to get upload status');
    }

    return response.json();
};

export const getUploadJobs = async (profile?: string): Promise<UploadJob[]> => {
    const url = profile
        ? `${API_BASE}/upload/jobs?profile=${encodeURIComponent(profile)}`
        : `${API_BASE}/upload/jobs`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error('Failed to get upload jobs');
    }

    const data = await response.json();
    return data.jobs;
};

export const deleteUploadJob = async (jobId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/upload/job/${jobId}`, {
        method: 'DELETE'
    });

    if (!response.ok) {
        throw new Error('Failed to delete job');
    }
};

// Polling helper for upload progress
export const pollUploadStatus = (
    jobId: string,
    onUpdate: (job: UploadJob) => void,
    intervalMs: number = 1000
): () => void => {
    let active = true;

    const poll = async () => {
        if (!active) return;

        try {
            const job = await getUploadStatus(jobId);
            onUpdate(job);

            // Stop polling if completed or error
            if (job.completed || job.error) {
                active = false;
                return;
            }

            setTimeout(poll, intervalMs);
        } catch (error) {
            console.error('Polling error:', error);
            setTimeout(poll, intervalMs * 2); // Back off on error
        }
    };

    poll();

    // Return cancel function
    return () => { active = false; };
};
