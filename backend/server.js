const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const Note = require('./models/Note');

const app = express();
app.use(cors());
app.use(express.json());

// Replace this string in a .env file later, but hardcode your Atlas URI here for testing if you want
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://<username>:<password>@your-cluster.mongodb.net/ghostnote';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- API ROUTES ---

// 1. Drop a new Ghost Note (UPDATED to accept deviceId)
app.post('/api/notes', async (req, res) => {
  try {
    const { latitude, longitude, text, deviceId } = req.body;
    
    // Set expiration 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const newNote = new Note({
      text,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // GeoJSON format requires Longitude first
      },
      expiresAt,
      deviceId // <-- Added here
    });

    await newNote.save();
    res.status(201).json({ message: 'Ghost Note dropped successfully!', note: newNote });
  } catch (error) {
    res.status(500).json({ error: 'Failed to drop note.' });
  }
});

// 2. Get all active notes (UPDATED to return views and deviceId)
app.get('/api/notes', async (req, res) => {
  try {
    // We only fetch notes that haven't expired yet
    const activeNotes = await Note.find({ expiresAt: { $gt: new Date() } });
    
    // Format them for the frontend
    const formattedNotes = activeNotes.map(note => ({
      id: note._id,
      text: note.text,
      latitude: note.location.coordinates[1],
      longitude: note.location.coordinates[0],
      expiresAt: note.expiresAt,
      deviceId: note.deviceId, // <-- Added here
      views: note.views        // <-- Added here
    }));

    res.status(200).json(formattedNotes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notes.' });
  }
});


// 3. NEW: Increment the view count when someone opens a note
app.post('/api/notes/:id/view', async (req, res) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id, 
      { $inc: { views: 1 } },
      { returnDocument: 'after' } // <-- We changed this line!
    );
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update view count' });
  }
});

// 4. NEW: Fetch ONLY the notes dropped by a specific user
app.get('/api/notes/my-drops/:deviceId', async (req, res) => {
  try {
    const myNotes = await Note.find({ deviceId: req.params.deviceId }).sort({ expiresAt: -1 });
    
    // Format them exactly like the active notes route
    const formattedNotes = myNotes.map(note => ({
      id: note._id,
      text: note.text,
      latitude: note.location.coordinates[1],
      longitude: note.location.coordinates[0],
      expiresAt: note.expiresAt,
      deviceId: note.deviceId,
      views: note.views
    }));

    res.status(200).json(formattedNotes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch your drops.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Ghost Note Backend running on port ${PORT}`);
});