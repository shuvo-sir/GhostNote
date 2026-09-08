// ui/services/api.ts

// Replace with your actual IPv4 address!
const BASE_URL = 'http://192.168.0.218:5000/api';

export interface GhostNote {
  id: string;
  latitude: number;
  longitude: number;
  text: string;
  expiresAt: string;
}

// 1. Drop Note API Call
export const dropGhostNote = async (latitude: number, longitude: number, text: string) => {
  const response = await fetch(`${BASE_URL}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ latitude, longitude, text }),
  });

  if (!response.ok) {
    throw new Error('Failed to drop note onto the server.');
  }
  return response.json();
};

// 2. Fetch Active Notes API Call
export const fetchActiveNotes = async (): Promise<GhostNote[]> => {
  const response = await fetch(`${BASE_URL}/notes`);
  if (!response.ok) {
    throw new Error('Failed to fetch nearby notes.');
  }
  return response.json();
};