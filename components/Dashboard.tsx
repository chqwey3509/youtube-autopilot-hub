import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LogEntry } from '../types';
import * as api from '../services/apiService';

interface UploadFile {
  id: string;
  video: File;
  subtitle: File | null;
  title: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  jobId: string | null;
  videoUrl: string | null;
  error: string | null;
}

const Dashboard: React.FC = () => {
  const [profile, setProfile] = useState('default');
  const [profiles, setProfiles] = useState<api.Profile[]>([]);
  const [authStatus, setAuthStatus] = useState<api.AuthStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('private');
  const [language, setLanguage] = useState<'en' | 'zh-TW' | 'ja'>('en');

  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (level: LogEntry['level'], message: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs((prev) => [...prev, newLog]);
  };

  // Scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Check auth status on mount and when profile changes
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const status = await api.getAuthStatus(profile);
        setAuthStatus(status);

        if (status.authenticated && status.channel) {
          addLog('INFO', `已登錄頻道: ${status.channel.title}`);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      }
    };

    checkAuth();
  }, [profile]);

  // Load profiles on mount
  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const profileList = await api.getProfiles();
        setProfiles(profileList);
      } catch (error) {
        console.error('Failed to load profiles:', error);
      }
    };

    loadProfiles();
  }, []);

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('auth_success')) {
      const authProfile = params.get('profile') || 'default';
      setProfile(authProfile);
      addLog('SUCCESS', `登錄成功! Profile: ${authProfile}`);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (params.get('auth_error')) {
      addLog('ERROR', `登錄失敗: ${params.get('auth_error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleLogin = () => {
    addLog('INFO', `正在重定向到 Google 登錄...`);
    api.login(profile);
  };

  const handleLogout = async () => {
    await api.logout(profile);
    setAuthStatus(null);
    addLog('INFO', `已登出 Profile: ${profile}`);
  };

  // File handling
  const processFiles = (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    const videoFiles = filesArray.filter(f =>
      /\.(mp4|mov|mkv|avi|wmv|flv|webm)$/i.test(f.name)
    );
    const subtitleFiles = filesArray.filter(f =>
      /\.(srt|vtt|sbv|sub|ass)$/i.test(f.name)
    );

    const newFiles: UploadFile[] = videoFiles.map(video => {
      const baseName = video.name.replace(/\.[^/.]+$/, '');
      const matchingSubtitle = subtitleFiles.find(sub =>
        sub.name.replace(/\.[^/.]+$/, '').toLowerCase() === baseName.toLowerCase()
      );

      return {
        id: Math.random().toString(36).substr(2, 9),
        video,
        subtitle: matchingSubtitle || null,
        title: baseName,
        status: 'pending' as const,
        progress: 0,
        jobId: null,
        videoUrl: null,
        error: null
      };
    });

    setFiles(prev => [...prev, ...newFiles]);

    newFiles.forEach(f => {
      addLog('INFO', `已添加: ${f.video.name}${f.subtitle ? ` (+字幕: ${f.subtitle.name})` : ''}`);
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  // Upload process
  const startUpload = async () => {
    if (!authStatus?.authenticated) {
      addLog('ERROR', '請先登錄 Google 帳戶');
      return;
    }

    if (files.length === 0) {
      addLog('ERROR', '請先添加視頻文件');
      return;
    }

    setIsProcessing(true);
    addLog('INFO', `開始上傳 ${files.length} 個視頻...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.status === 'completed') continue;

      try {
        // Update status to uploading
        setFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, status: 'uploading' as const } : f
        ));

        addLog('UPLOAD', `正在上傳: ${file.video.name}`);

        // Start upload
        const response = await api.uploadVideo(
          file.video,
          file.subtitle,
          {
            profile,
            title: file.title,
            privacy,
            language
          }
        );

        // Update with job ID
        setFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, jobId: response.job_id } : f
        ));

        // Poll for status
        await new Promise<void>((resolve) => {
          const cancel = api.pollUploadStatus(response.job_id, (job) => {
            setFiles(prev => prev.map(f => {
              if (f.id !== file.id) return f;

              return {
                ...f,
                progress: job.video_progress,
                status: job.completed ? 'completed' : job.error ? 'error' : 'uploading',
                videoUrl: job.video_url,
                error: job.error
              };
            }));

            if (job.completed) {
              addLog('SUCCESS', `上傳完成: ${file.video.name} → ${job.video_url}`);
              if (job.subtitle_uploaded) {
                addLog('SUCCESS', `字幕已附加: ${file.subtitle?.name}`);
              }
              resolve();
            } else if (job.error) {
              addLog('ERROR', `上傳失敗: ${job.error}`);
              resolve();
            }
          });
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知錯誤';
        addLog('ERROR', `上傳失敗: ${errorMsg}`);

        setFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, status: 'error' as const, error: errorMsg } : f
        ));
      }
    }

    addLog('INFO', '批量上傳完成!');
    setIsProcessing(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <header className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-slate-400 text-sm">
            {authStatus?.authenticated
              ? `已連接: ${authStatus.channel?.title || profile}`
              : '請登錄 Google 帳戶以開始上傳'
            }
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Profile Selector */}
          <div className="flex flex-col items-end">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Profile</label>
            <input
              type="text"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="default"
              disabled={isProcessing}
            />
          </div>

          {/* Privacy Selector */}
          <div className="flex flex-col items-end">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">隱私</label>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'private' | 'unlisted' | 'public')}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500"
              disabled={isProcessing}
            >
              <option value="private">私人</option>
              <option value="unlisted">不公開</option>
              <option value="public">公開</option>
            </select>
          </div>

          {/* Language Selector */}
          <div className="flex flex-col items-end">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">字幕語言</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'zh-TW' | 'ja')}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500"
              disabled={isProcessing}
            >
              <option value="en">English (en)</option>
              <option value="zh-TW">繁體中文 (zh-TW)</option>
              <option value="ja">日本語 (ja)</option>
            </select>
          </div>

          {/* Auth Button */}
          {authStatus?.authenticated ? (
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
            >
              登出
            </button>
          ) : (
            <button
              onClick={handleLogin}
              className="px-5 py-2 rounded font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all"
            >
              登錄 Google
            </button>
          )}

          {/* Upload Button */}
          <button
            onClick={startUpload}
            disabled={isProcessing || !authStatus?.authenticated || files.length === 0}
            className={`px-5 py-2 rounded font-medium transition-all ${isProcessing || !authStatus?.authenticated || files.length === 0
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20'
              }`}
          >
            {isProcessing ? '上傳中...' : '開始上傳'}
          </button>
        </div>
      </header>

      <div className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-hidden">
        {/* Queue Panel */}
        <div className="flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
            <h3 className="font-semibold text-slate-200">上傳隊列</h3>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded border border-slate-600"
            >
              + 添加文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,.srt,.vtt"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Drop Zone */}
          <div
            className={`flex-1 overflow-y-auto p-4 space-y-3 transition-colors ${isDragging ? 'bg-red-500/10 border-2 border-dashed border-red-500' : ''
              }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {files.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-lg mb-1">拖放視頻文件到這裡</p>
                <p className="text-sm">支持 MP4, MOV, MKV, AVI + SRT/VTT 字幕</p>
              </div>
            ) : (
              files.map((file) => (
                <div key={file.id} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded flex items-center justify-center ${file.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                        file.status === 'uploading' ? 'bg-blue-500/20 text-blue-500' :
                          file.status === 'error' ? 'bg-red-500/20 text-red-500' :
                            'bg-slate-800 text-slate-500'
                        }`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-200">{file.video.name}</div>
                        <div className="text-xs text-slate-500">
                          {formatFileSize(file.video.size)}
                          {file.subtitle && ` • +字幕: ${file.subtitle.name}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {file.status === 'completed' && file.videoUrl && (
                        <a
                          href={file.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          查看
                        </a>
                      )}
                      {file.status === 'completed' && <span className="text-xs text-green-500 font-medium">完成</span>}
                      {file.status === 'uploading' && <span className="text-xs text-blue-400 font-medium animate-pulse">{file.progress}%</span>}
                      {file.status === 'error' && <span className="text-xs text-red-500 font-medium">失敗</span>}
                      {file.status === 'pending' && (
                        <button
                          onClick={() => removeFile(file.id)}
                          className="text-slate-500 hover:text-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${file.status === 'completed' ? 'bg-green-500' :
                        file.status === 'error' ? 'bg-red-500' :
                          'bg-blue-500'
                        }`}
                      style={{ width: `${file.progress}%` }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Console Panel */}
        <div className="flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
            <h3 className="font-semibold text-slate-200">Terminal Output</h3>
            <div className="flex space-x-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
            </div>
          </div>
          <div className="flex-1 bg-black p-4 font-mono text-sm overflow-y-auto">
            {logs.length === 0 && (
              <div className="text-slate-600 italic">Ready to start process...</div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="mb-1 leading-relaxed">
                <span className="text-slate-500 select-none">[{log.timestamp}] </span>
                <span className={`font-bold ${log.level === 'INFO' ? 'text-blue-400' :
                  log.level === 'UPLOAD' ? 'text-yellow-400' :
                    log.level === 'SUCCESS' ? 'text-green-400' :
                      'text-red-500'
                  }`}>[{log.level}]</span>
                <span className="text-slate-300 ml-2">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;