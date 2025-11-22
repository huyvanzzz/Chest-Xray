import React, { useState, useEffect, useRef } from 'react';
import { Terminal, RefreshCw, Pause, Play, Trash2, Download } from 'lucide-react';

export const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lineCount, setLineCount] = useState(100);
  const [loading, setLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    document.title = "Spark Logs - X-Ray System";
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/spark-logs?lines=${lineCount}`);
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogs('Error: Cannot fetch logs from server');
    } finally {
      setLoading(false);
    }
  };

  const startStreaming = async () => {
    if (isStreaming) return;

    // Create new AbortController for this stream
    abortControllerRef.current = new AbortController();
    
    setIsStreaming(true);
    setIsPaused(false);
    setLogs(''); // Clear old logs
    
    try {
      const response = await fetch('/api/spark-logs/stream', {
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');

      if (!reader) {
        throw new Error('No reader available');
      }

      // Read stream continuously
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('Stream ended naturally');
            setIsStreaming(false);
            setLogs(prev => prev + '\n\n[Stream ended]\n');
            break;
          }
          
          if (value) {
            const text = decoder.decode(value, { stream: true });
            setLogs(prev => prev + text);
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          console.log('Stream aborted by user');
          setLogs(prev => prev + '\n\n[Stream stopped]\n');
        } else {
          console.error('Stream read error:', err);
          setLogs(prev => prev + '\n\n[Stream error: ' + (err as Error).message + ']\n');
        }
        setIsStreaming(false);
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error('Error starting stream:', error);
        setLogs(prev => prev + '\n\nError: Cannot start stream - ' + (error as Error).message + '\n');
      }
      setIsStreaming(false);
    }
  };

  const stopStreaming = () => {
    setIsStreaming(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const clearLogs = () => {
    setLogs('');
  };

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spark_logs_${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="w-8 h-8 text-green-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Spark Streaming Logs</h1>
              <p className="text-sm text-gray-400">Real-time monitoring của Spark job</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Line Count Selector */}
            <select
              value={lineCount}
              onChange={(e) => setLineCount(Number(e.target.value))}
              className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:ring-2 focus:ring-blue-500"
              disabled={isStreaming}
            >
              <option value={50}>50 lines</option>
              <option value={100}>100 lines</option>
              <option value={200}>200 lines</option>
              <option value={500}>500 lines</option>
              <option value={1000}>1000 lines</option>
            </select>

            {/* Refresh Button */}
            <button
              onClick={fetchLogs}
              disabled={loading || isStreaming}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {/* Stream Toggle */}
            {!isStreaming ? (
              <button
                onClick={startStreaming}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors"
              >
                <Play className="w-4 h-4" />
                Start Stream
              </button>
            ) : (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
              >
                <Pause className="w-4 h-4" />
                Stop Stream
              </button>
            )}

            {/* Clear Button */}
            <button
              onClick={clearLogs}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>

            {/* Download Button */}
            <button
              onClick={downloadLogs}
              disabled={!logs}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-3 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
            <span className="text-gray-300">
              {isStreaming ? (isPaused ? 'Paused' : 'Streaming') : 'Stopped'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoScroll"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="autoScroll" className="text-gray-300">
              Auto-scroll
            </label>
          </div>
          <div className="text-gray-400">
            Lines: {logs.split('\n').length - 1}
          </div>
        </div>
      </div>

      {/* Logs Container */}
      <div 
        ref={logsContainerRef}
        className="flex-1 overflow-auto bg-black p-4 font-mono text-sm"
      >
        {loading && !logs ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading logs...</div>
          </div>
        ) : (
          <>
            <pre className="text-green-400 whitespace-pre-wrap break-words">
              {logs || 'No logs available. Click "Refresh" to load logs.'}
            </pre>
            <div ref={logsEndRef} />
          </>
        )}
      </div>
    </div>
  );
};
