export const API_BASE = 'http://localhost:8000';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchModelInfo() {
  const res = await fetch(`${API_BASE}/api/model-info`);

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
    const res = await fetch(`${API_BASE}/api/analyze`, {
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