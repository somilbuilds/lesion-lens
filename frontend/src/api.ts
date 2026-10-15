const configuredApiBase = import.meta.env.VITE_API_BASE_URL;

// Localhost is only a development fallback. Never silently point a deployed
// frontend at the visitor's own computer.
export const API_BASE =
  configuredApiBase ||
  (import.meta.env.DEV ? 'http://localhost:8000' : '');

function getApiUrl(path: string) {
  if (!API_BASE) {
    throw new Error(
      'Backend URL is not configured. Set VITE_API_BASE_URL in the frontend deployment environment and rebuild.'
    );
  }

  return `${API_BASE}${path}`;
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

export async function analyzeImage(file: File, symptoms: any) {
  const formData = new FormData();
  formData.append('image', file);

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
      throw new Error(
        `Invalid response from API: ${text.slice(0, 300)}`
      );
    }
  } catch (err: any) {
    if (err instanceof TypeError) {
      throw new Error(
        `Network error connecting to ${API_BASE}/api/analyze: ${err.message}`
      );
    }

    throw err;
  }
}
