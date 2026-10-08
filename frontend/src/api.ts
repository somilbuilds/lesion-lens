export const API_BASE = 'https://lesion-lens-h6ld.onrender.com';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

export async function fetchModelInfo() {
  const res = await fetch(`${API_BASE}/api/model-info`);
  return res.json();
}

export async function analyzeImage(file: File, symptoms: any) {
  const formData = new FormData();
  formData.append('image', file);
  
  if (symptoms) {
    for (const [key, value] of Object.entries(symptoms)) {
      if (value !== undefined && value !== null) {
        formData.append(key, value.toString());
      }
    }
  }

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) {
    throw new Error('Analysis request failed');
  }
  return res.json();
}
