function resolveApiBase(): string {
  // 1. Check if URL has ?backend=https://... or ?api=https://...
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const paramUrl = params.get('backend') || params.get('api');
    if (paramUrl) {
      try {
        const parsed = new URL(paramUrl);
        const origin = parsed.origin;
        localStorage.setItem('skinlesion_backend_override', origin);
        return origin;
      } catch {
        // ignore invalid URL
      }
    }
    // 2. Check saved localStorage override from a previous session
    const stored = localStorage.getItem('skinlesion_backend_override');
    if (stored) return stored;
  }

  // 3. Built-in Render environment variable from build time
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');

  // 4. Default: empty string (same-origin / Vite proxy for local development)
  return '';
}

export const API_BASE = resolveApiBase();

function getApiUrl(path: string) {
  const base = resolveApiBase();
  if (!base && !import.meta.env.DEV) {
    throw new Error(
      'Backend URL is not configured. Start your local tunnel or pass ?backend=https://your-tunnel.trycloudflare.com in the URL.'
    );
  }

  return base ? `${base}${path}` : path;
}

export async function fetchHealth() {
  const res = await fetch(getApiUrl('/api/health'));

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchModelInfo() {
  const res = await fetch(getApiUrl('/api/model-info'));

  if (!res.ok) {
    throw new Error(`Model info failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchConditions() {
  const res = await fetch(getApiUrl('/api/conditions'));
  if (!res.ok) throw new Error(`Condition library failed: ${res.status}`);
  return res.json();
}

export async function analyzeImage(
  file: File,
  symptoms: any,
  allowAiReport = false,
  modelContext: Record<string, string> = {}
) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('allow_ai_report', String(allowAiReport));
  for (const [key, value] of Object.entries(modelContext)) {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key === 'localization' ? 'body_region' : key, value);
    }
  }

  if (symptoms) {
    for (const [key, value] of Object.entries(symptoms)) {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, value.toString());
      }
    }
  }

  try {
    const res = await fetch(getApiUrl('/api/analyze'), {
      method: 'POST',
      body: formData,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`API ${res.status}: ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid response from API: ${text.slice(0, 300)}`);
    }
  } catch (err: any) {
    if (err instanceof TypeError) {
      throw new Error(
        `Network error connecting to ${API_BASE || 'the local Vite proxy'}/api/analyze: ${err.message}`
      );
    }

    throw err;
  }
}

export async function sendCopilotMessage(
  messages: Array<{ role: string; content: string }>,
  context: Record<string, any>
) {
  try {
    const res = await fetch(getApiUrl('/api/chat/copilot'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, context }),
    });

    if (!res.ok) {
      throw new Error(`Copilot chat failed (${res.status})`);
    }

    return await res.json();
  } catch (err: any) {
    console.error('Failed to communicate with copilot:', err);
    return {
      reply: 'Could not connect to the Clinical Copilot. Please check your backend connection.',
      provider: 'error',
    };
  }
}
