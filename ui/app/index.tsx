import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Modal, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { getDistance } from 'geolib';

// Import our custom MongoDB API calls
import { GhostNote, dropGhostNote, fetchActiveNotes } from '../services/api';

export default function MapUI() {
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [activeNotes, setActiveNotes] = useState<GhostNote[]>([]);
  
  // UI State
  const [selectedNote, setSelectedNote] = useState<GhostNote | null>(null);
  const [isDropModalVisible, setIsDropModalVisible] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readNoteIds, setReadNoteIds] = useState<string[]>([]);

  // 1. Initialize GPS & Fetch Initial Notes
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'GPS is required to find Ghost Notes.');
        return;
      }

      locationSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 3 },
        (loc) => setUserLocation(loc.coords)
      );
    })();

    // Initial fetch
    loadNotes();

    // Poll for new notes every 10 seconds to keep the map updated
    const interval = setInterval(loadNotes, 10000);

    return () => {
      if (locationSubscription) locationSubscription.remove();
      clearInterval(interval);
    };
  }, []);

  const loadNotes = async () => {
    try {
      const notes = await fetchActiveNotes();
      setActiveNotes(notes);
    } catch (error) {
      console.log("Error loading notes:", error);
    }
  };

  // 2. Handle tapping a note on the map
const handleMarkerPress = (note: GhostNote) => {
    if (!userLocation) return;

    const distanceMeters = getDistance(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: note.latitude, longitude: note.longitude }
    );

    if (distanceMeters <= 50) {
      setSelectedNote(note); // Unlocked! Open the note.
      
      // GHOST EFFECT: Remember that we read this note!
      const noteKey = note.id || (note as any)._id;
      if (noteKey && !readNoteIds.includes(noteKey)) {
        setReadNoteIds((prev) => [...prev, noteKey]);
      }
    } else {
      Alert.alert('Out of Range 🔒', `You are ${distanceMeters}m away. Walk closer!`);
    }
  };

  // 3. Handle dropping a new note
  const handleCreateDrop = async () => {
    if (!newNoteText.trim() || !userLocation) return;

    setIsSubmitting(true);
    try {
      // Send it to the MongoDB database
      await dropGhostNote(userLocation.latitude, userLocation.longitude, newNoteText.trim());
      
      // OPTIMISTIC UPDATE: Instantly create a temporary note on the map so you see it right away
      const instantNote: GhostNote = {
        id: Math.random().toString(), // Temp ID until the server refresh catches up
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        text: newNoteText.trim(),
        expiresAt: new Date().toISOString()
      };
      
      // Add it to the screen immediately
      setActiveNotes((prevNotes) => [...prevNotes, instantNote]);

      setNewNoteText('');
      setIsDropModalVisible(false);
      Alert.alert('Dropped!', 'Your ghost note is pinned for 24 hours.');
      
      // Fetch the real data from the server behind the scenes to sync up
      loadNotes(); 
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!userLocation) {
    return (
      <View style={styles.centerLoading}>
        <ActivityIndicator size="large" color="#00CEC9" />
        <Text style={styles.loadingText}>Acquiring GPS...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE} 
        mapType="hybrid" 
        style={styles.map}
        initialRegion={{
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        }}
        showsUserLocation
        followsUserLocation
      >
        {/* Draw a 50-meter radius circle around the user */}
        <Circle
          center={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
          radius={50}
          strokeColor="rgba(108, 92, 231, 0.8)"
          fillColor="rgba(108, 92, 231, 0.2)"
        />

        {/* Render all the active notes from the database */}
        {activeNotes
          // NEW: Filter out any notes we have already read!
          .filter((note) => {
            const noteKey = note.id || (note as any)._id;
            return !readNoteIds.includes(noteKey);
          })
          .map((note, index) => {
            if (!note.latitude || !note.longitude) return null;

            const distance = getDistance(userLocation, { latitude: note.latitude, longitude: note.longitude });
            const isUnlocked = distance <= 50;
            const noteKey = note.id || (note as any)._id || index.toString();

            return (
              <Marker
                key={noteKey}
                coordinate={{ latitude: note.latitude, longitude: note.longitude }}
                onPress={() => handleMarkerPress(note)}
                pinColor={isUnlocked ? '#00CEC9' : '#636E72'}
              />
            );
        })}
      </MapView>

      <TouchableOpacity style={styles.dropFab} onPress={() => setIsDropModalVisible(true)}>
        <Text style={styles.dropFabText}>+ Drop Note</Text>
      </TouchableOpacity>

      {/* Read Note Modal */}
      <Modal visible={selectedNote !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeader}>👻 Discovered</Text>
            <Text style={styles.modalBody}>{selectedNote?.text}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedNote(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Drop Note Modal */}
      <Modal visible={isDropModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeader}>Drop a Note</Text>
            <TextInput
              style={styles.input}
              placeholder="Secret message..."
              placeholderTextColor="#888"
              multiline
              value={newNoteText}
              onChangeText={setNewNoteText}
            />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => setIsDropModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.submitBtn]} onPress={handleCreateDrop} disabled={isSubmitting}>
                <Text style={styles.btnText}>{isSubmitting ? '...' : 'Drop'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  centerLoading: { flex: 1, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFF', marginTop: 12, fontSize: 16 },
  dropFab: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#6C5CE7', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 30, elevation: 5 },
  dropFabText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#181824', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#6C5CE7' },
  modalHeader: { color: '#00CEC9', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  modalBody: { color: '#FFF', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  input: { backgroundColor: '#252538', color: '#FFF', padding: 14, borderRadius: 12, height: 100, textAlignVertical: 'top', marginBottom: 20 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 0.48, padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#444' },
  submitBtn: { backgroundColor: '#6C5CE7' },
  closeBtn: { backgroundColor: '#FF7675', padding: 14, borderRadius: 10, alignItems: 'center' },
  closeBtnText: { color: '#FFF', fontWeight: 'bold' },
  btnText: { color: '#FFF', fontWeight: 'bold' },
});