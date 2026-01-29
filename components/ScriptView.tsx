import React, { useState } from 'react';
import { PYTHON_SCRIPT, REQUIREMENTS_TXT } from '../utils/pythonCode';

const ScriptView: React.FC = () => {
  const [activeFile, setActiveFile] = useState<'script' | 'requirements'>('script');
  const [copied, setCopied] = useState(false);

  const content = activeFile === 'script' ? PYTHON_SCRIPT : REQUIREMENTS_TXT;
  const filename = activeFile === 'script' ? 'youtube_uploader.py' : 'requirements.txt';

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <header className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm">
        <div>
          <h2 className="text-2xl font-bold text-white">Generated Code</h2>
          <p className="text-slate-400 text-sm">Production-ready automation logic</p>
        </div>
        <div className="flex space-x-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveFile('script')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              activeFile === 'script' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            youtube_uploader.py
          </button>
          <button
            onClick={() => setActiveFile('requirements')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              activeFile === 'requirements' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            requirements.txt
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative group">
        <div className="absolute top-4 right-8 z-10">
          <button
            onClick={handleCopy}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded border border-slate-700 shadow-lg transition-all"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        <div className="h-full overflow-auto p-8 bg-[#0d1117]">
          <pre className="font-mono text-sm text-slate-300 leading-relaxed">
            <code>{content}</code>
          </pre>
        </div>
      </div>

      <div className="px-8 py-4 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-start space-x-3 text-sm text-slate-400">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>
            To use this script, install dependencies via <code className="bg-slate-800 px-1 rounded text-slate-200">pip install -r requirements.txt</code>, 
            place your <code className="bg-slate-800 px-1 rounded text-slate-200">client_secrets.json</code> in the same folder, and run 
            <code className="bg-slate-800 px-1 rounded text-slate-200 ml-1">python {filename} --user my_channel</code>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ScriptView;