const configuredApiBase = import.meta.env.VITE_API_BASE_URL;

// In local development, use Vite's same-origin proxy so localhost/127.0.0.1
// resolution and browser CORS settings cannot break calls to the local backend.
// Deployed frontends must explicitly configure their backend URL.
export const API_BASE = configuredApiBase || '';

function getApiUrl(path: string) {
  if (!API_BASE && !import.meta.env.DEV) {
    throw new Error(
      'Backend URL is not configured. Set VITE_API_BASE_URL in the frontend deployment environment and rebuild.'
    );
  }

  return API_BASE ? `${API_BASE}${path}` : path;
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
        `Network error connecting to ${API_BASE || 'the local Vite proxy'}/api/analyze: ${err.message}`
      );
    }

    throw err;
  }
}
