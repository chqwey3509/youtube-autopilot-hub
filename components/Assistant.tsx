import React, { useState, useRef, useEffect } from 'react';
import { generateResponse } from '../services/geminiService';
import { PYTHON_SCRIPT } from '../utils/pythonCode';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const Assistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hello! I am your YouTube Automation Expert. You can ask me to explain parts of the script, customize logic, or troubleshoot OAuth issues.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    // Pass the python script as context so Gemini knows what we are talking about
    const response = await generateResponse(userMsg, PYTHON_SCRIPT);

    setMessages(prev => [...prev, { role: 'assistant', text: response }]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <header className="px-8 py-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          AI Assistant <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30">Powered by Gemini</span>
        </h2>
        <p className="text-slate-400 text-sm">Interactive help for your automation script</p>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-3xl rounded-2xl px-6 py-4 shadow-md ${
              msg.role === 'user' 
                ? 'bg-red-600 text-white rounded-br-none' 
                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                  {msg.text}
                </div>
              ) : (
                <p>{msg.text}</p>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-none px-6 py-4 flex items-center space-x-2">
               <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
               <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
               <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-6 border-t border-slate-800 bg-slate-900/30">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the code (e.g., 'How do I change the video category?')"
            className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-4 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-xl placeholder:text-slate-600"
          />
          <div className="absolute right-2 top-2 bottom-2">
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="h-full px-6 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Assistant;