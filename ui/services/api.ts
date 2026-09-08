// ui/services/api.ts

// Your correct IPv4 address!
const BASE_URL = 'http://192.168.0.218:5000/api';

export interface GhostNote {
  id?: string;
  _id?: string;
  latitude: number;
  longitude: number;
  text: string;
  expiresAt: string;
  deviceId: string; // <-- NEW: Tracks who dropped it
  views: number;    // <-- NEW: Tracks how many people saw it
}

// 1. Drop Note API Call (UPDATED to send deviceId)
export const dropGhostNote = async (latitude: number, longitude: number, text: string, deviceId: string) => {
  const response = await fetch(`${BASE_URL}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ latitude, longitude, text, deviceId }),
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

// 3. NEW: Tell the server to add +1 to the view counter
export const incrementNoteView = async (noteId: string) => {
  const response = await fetch(`${BASE_URL}/notes/${noteId}/view`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to register view.');
  return response.json();
};

// 4. NEW: Fetch only the notes this specific user created
export const fetchMyDrops = async (deviceId: string): Promise<GhostNote[]> => {
  const response = await fetch(`${BASE_URL}/notes/my-drops/${deviceId}`);
  if (!response.ok) throw new Error('Failed to fetch your drops.');
  return response.json();
};