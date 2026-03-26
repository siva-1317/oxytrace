import React, { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';

const API_URL = import.meta.env.VITE_API_URL;

export default function AIAnalysisPanel({ cylinderId }) {
  const { accessToken } = useAuth();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const geminiOverrideKey = useMemo(() => localStorage.getItem('oxytrace-gemini-key') || '', []);
  const geminiOverrideModel = useMemo(() => localStorage.getItem('oxytrace-gemini-model') || '', []);
  const geminiOverrideTemp = useMemo(() => localStorage.getItem('oxytrace-gemini-temp') || '', []);

  async function askAI() {
    if (!question.trim()) return;
    setAnswer('');
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/api/ai/cylinder-analysis?stream=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(geminiOverrideKey ? { 'x-gemini-key': geminiOverrideKey } : {}),
          ...(geminiOverrideModel ? { 'x-gemini-model': geminiOverrideModel } : {}),
          ...(geminiOverrideTemp ? { 'x-gemini-temp': geminiOverrideTemp } : {})
        },
        body: JSON.stringify({ cylinderId, question }),
        signal: controller.signal
      });
      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `AI request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const chunk = line.slice(6);
          if (chunk === '[DONE]') continue;
          setAnswer((a) => a + chunk);
        }
      }

      toast.success('AI response ready');
    } catch (e) {
      if (e.name !== 'AbortError') toast.error(e.message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Ask AI about this cylinder</div>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent ring-1 ring-accent/15">
          OxyTrace AI
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Is this cylinder trending towards a leak?"
          className="w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm outline-none transition focus:border-accent/50"
        />
        <button
          onClick={askAI}
          disabled={loading || !question.trim()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2 disabled:opacity-50"
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {answer ? (
        <div className="mt-4 whitespace-pre-wrap rounded-xl border border-border/50 bg-card/30 p-3 text-sm leading-relaxed">
          {answer}
        </div>
      ) : (
        <div className="mt-4 text-sm text-muted">Gemini response streams here word-by-word.</div>
      )}
      {loading ? (
        <div className="mt-2">
          <button onClick={() => abortRef.current?.abort()} className="text-xs text-muted hover:text-text">
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
