import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Modal, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { getDistance } from 'geolib';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostNote, dropGhostNote, fetchActiveNotes, incrementNoteView, fetchMyDrops } from '../services/api';

export default function MapUI() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [activeNotes, setActiveNotes] = useState<GhostNote[]>([]);
  const [readNoteIds, setReadNoteIds] = useState<string[]>([]);
  const [showReadNotes, setShowReadNotes] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'denied' | 'ready'>('loading');
  const [notesStatus, setNotesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // NEW: Anonymous Tracking State
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [myDrops, setMyDrops] = useState<GhostNote[]>([]);
  const [isMyDropsVisible, setIsMyDropsVisible] = useState(false);

  // UI State
  const [selectedNote, setSelectedNote] = useState<GhostNote | null>(null);
  const [isDropModalVisible, setIsDropModalVisible] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const maxNoteLength = 280;

  async function loadNotes() {
    setNotesStatus('loading');
    try {
      const notes = await fetchActiveNotes();
      setActiveNotes(notes);
      setNotesStatus('ready');
    } catch (error) {
      console.log('Error loading notes:', error);
      setNotesStatus('error');
    }
  }

  // 1. Initialize App (GPS & Device ID)
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription;

    (async () => {
      // Setup Anonymous Device ID
      let storedId = await AsyncStorage.getItem('ghost_device_id');
      if (!storedId) {
        storedId = 'ghost_' + Math.random().toString(36).substring(2, 15);
        await AsyncStorage.setItem('ghost_device_id', storedId);
      }
      setDeviceId(storedId);

      // Setup GPS
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        return;
      }

      setLocationStatus('ready');

      locationSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 3 },
        (loc) => setUserLocation(loc.coords)
      );
    })();

    const initialLoad = setTimeout(loadNotes, 0);
    const interval = setInterval(loadNotes, 10000);

    return () => {
      if (locationSubscription) locationSubscription.remove();
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadNotes();
    setIsRefreshing(false);
  };

  const handleRetryLocation = async () => {
    setLocationStatus('loading');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationStatus('denied');
      return;
    }
    setLocationStatus('ready');
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setUserLocation(location.coords);
  };

  const handleRecenter = () => {
    if (!userLocation) return;
    mapRef.current?.animateToRegion({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.003,
      longitudeDelta: 0.003,
    }, 400);
  };

  const handleOpenMyDrops = async () => {
    if (!deviceId) return;
    try {
      const drops = await fetchMyDrops(deviceId);
      setMyDrops(drops);
      setIsMyDropsVisible(true);
    } catch {
      Alert.alert('Error', 'Could not load your drops.');
    }
  };

  // 2. Handle tapping a note
  const handleMarkerPress = async (note: GhostNote) => {
    if (!userLocation) return;

    const distanceMeters = getDistance(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: note.latitude, longitude: note.longitude }
    );

    if (distanceMeters <= 50) {
      setSelectedNote(note); 
      
      const noteKey = note.id || (note as any)._id;
      if (noteKey && !readNoteIds.includes(noteKey)) {
        // Mark as read locally to hide it
        setReadNoteIds((prev) => [...prev, noteKey]);
        
        // NEW: Tell the backend someone viewed this! (Don't count our own notes)
        if (note.deviceId !== deviceId) {
          incrementNoteView(noteKey).catch(console.error);
        }
      }
    } else {
      Alert.alert('Out of Range 🔒', `You are ${distanceMeters}m away. Walk closer!`);
    }
  };

  // 3. Handle dropping a note
  const handleCreateDrop = async () => {
    if (!newNoteText.trim() || !userLocation || !deviceId) return;

    setIsSubmitting(true);
    try {
      await dropGhostNote(userLocation.latitude, userLocation.longitude, newNoteText.trim(), deviceId);
      
      const instantNote: GhostNote = {
        id: Math.random().toString(),
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        text: newNoteText.trim(),
        expiresAt: new Date().toISOString(),
        deviceId: deviceId,
        views: 0
      };
      
      setActiveNotes((prevNotes) => [...prevNotes, instantNote]);
      setNewNoteText('');
      setIsDropModalVisible(false);
      Alert.alert('Dropped!', 'Your ghost note is pinned for 24 hours.');
      
      loadNotes(); 
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (locationStatus === 'denied') {
    return (
      <View style={styles.centerLoading}>
        <Text style={styles.stateIcon}>!</Text>
        <Text style={styles.stateTitle}>Location access is off</Text>
        <Text style={styles.stateBody}>GhostNote needs your location to show nearby notes and place new ones.</Text>
        <TouchableOpacity style={styles.stateButton} onPress={handleRetryLocation}>
          <Text style={styles.stateButtonText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.textButtonText}>Open settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (locationStatus === 'loading' || !userLocation) {
    return (
      <View style={styles.centerLoading}>
        <ActivityIndicator size="large" color="#00CEC9" />
        <Text style={styles.loadingText}>Finding your location...</Text>
        <Text style={styles.loadingSubtext}>This helps unlock notes within 50 meters.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
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
        <Circle
          center={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
          radius={50}
          strokeColor="rgba(108, 92, 231, 0.8)"
          fillColor="rgba(108, 92, 231, 0.2)"
        />

        {activeNotes
          .filter((note) => {
            const noteKey = note.id || (note as any)._id;
            return showReadNotes || !readNoteIds.includes(noteKey);
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

      <View style={[styles.topActions, { top: insets.top + 12 }]}>
        <TouchableOpacity style={styles.topButton} onPress={handleOpenMyDrops} accessibilityRole="button" accessibilityLabel="Open my drops">
          <Text style={styles.topButtonText}>My drops</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={handleRefresh} accessibilityRole="button" accessibilityLabel="Refresh notes">
          {isRefreshing ? <ActivityIndicator size="small" color="#00CEC9" /> : <Text style={styles.iconButtonText}>↻</Text>}
        </TouchableOpacity>
      </View>

      <View style={[styles.mapTools, { top: insets.top + 74 }]}>
        <TouchableOpacity style={styles.iconButton} onPress={handleRecenter} accessibilityRole="button" accessibilityLabel="Recenter map">
          <Text style={styles.iconButtonText}>◎</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => setShowReadNotes((visible) => !visible)} accessibilityRole="button" accessibilityLabel={showReadNotes ? 'Hide read notes' : 'Show read notes'}>
          <Text style={styles.iconButtonText}>{showReadNotes ? '◉' : '○'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.mapStatus, { top: insets.top + 74 }]}>
        {notesStatus === 'error' ? (
          <TouchableOpacity onPress={handleRefresh} accessibilityRole="button" accessibilityLabel="Retry loading notes">
            <Text style={styles.mapStatusText}>Could not load notes · Retry</Text>
          </TouchableOpacity>
        ) : notesStatus === 'ready' && activeNotes.length === 0 ? (
          <Text style={styles.mapStatusText}>No nearby notes yet</Text>
        ) : null}
      </View>

      <View style={[styles.legend, { bottom: insets.bottom + 88 }]}>
        <Text style={styles.legendText}><Text style={styles.unlockedDot}>●</Text> Unlocked</Text>
        <Text style={styles.legendText}><Text style={styles.lockedDot}>●</Text> Locked</Text>
      </View>

      <TouchableOpacity style={[styles.dropFab, { bottom: insets.bottom + 20 }]} onPress={() => setIsDropModalVisible(true)} accessibilityRole="button" accessibilityLabel="Drop a new note">
        <Text style={styles.dropFabText}>+ Drop note</Text>
      </TouchableOpacity>

      {/* NEW: My Drops Modal */}
      <Modal visible={isMyDropsVisible} transparent animationType="slide" onRequestClose={() => setIsMyDropsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeader}>My Ghost Notes</Text>
            <ScrollView style={styles.dropsList}>
              {myDrops.length === 0 ? (
                <Text style={styles.modalBody}>You have not dropped any notes yet!</Text>
              ) : (
                myDrops.map((drop, idx) => (
                  <View key={drop.id || idx} style={styles.dropItem}>
                    <Text style={styles.dropItemText} numberOfLines={2}>&quot;{drop.text}&quot;</Text>
                    <View style={styles.viewBadge}>
                      <Text style={styles.viewBadgeText}>👁️ {drop.views} views</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setIsMyDropsVisible(false)} accessibilityRole="button" accessibilityLabel="Close my drops">
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Read Note Modal */}
      <Modal visible={selectedNote !== null} transparent animationType="fade" onRequestClose={() => setSelectedNote(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeader}>👻 Discovered</Text>
            <Text style={styles.modalBody}>{selectedNote?.text}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedNote(null)} accessibilityRole="button" accessibilityLabel="Close discovered note">
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Drop Note Modal */}
      <Modal visible={isDropModalVisible} transparent animationType="slide" onRequestClose={() => setIsDropModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeader}>Drop a Note</Text>
            <Text style={styles.modalHint}>Leave a small secret for someone nearby.</Text>
            <TextInput
              style={styles.input}
              placeholder="Secret message..."
              placeholderTextColor="#888"
              multiline
              value={newNoteText}
              maxLength={maxNoteLength}
              onChangeText={setNewNoteText}
              accessibilityLabel="Ghost note message"
            />
            <Text style={styles.characterCount}>{newNoteText.length}/{maxNoteLength}</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => setIsDropModalVisible(false)} accessibilityRole="button">
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.submitBtn, (!newNoteText.trim() || isSubmitting) && styles.disabledBtn]} onPress={handleCreateDrop} disabled={isSubmitting || !newNoteText.trim()} accessibilityRole="button" accessibilityLabel="Drop note">
                {isSubmitting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.btnText}>Drop</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  centerLoading: { flex: 1, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' },
  stateIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FF7675', color: '#FFF', textAlign: 'center', lineHeight: 48, fontSize: 26, fontWeight: 'bold' },
  stateTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 20 },
  stateBody: { color: '#B8B8C8', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 300, marginTop: 10 },
  stateButton: { backgroundColor: '#6C5CE7', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginTop: 24 },
  stateButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  textButton: { padding: 12, marginTop: 4 },
  textButtonText: { color: '#00CEC9', fontWeight: 'bold' },
  loadingText: { color: '#FFF', marginTop: 12, fontSize: 16 },
  loadingSubtext: { color: '#A9A9B5', marginTop: 8, fontSize: 13 },
  
  // Buttons
  dropFab: { position: 'absolute', alignSelf: 'center', backgroundColor: '#6C5CE7', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 30, elevation: 5 },
  dropFabText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  topActions: { position: 'absolute', right: 20, flexDirection: 'row', gap: 8 },
  topButton: { backgroundColor: 'rgba(24, 24, 36, 0.92)', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 20, borderWidth: 1, borderColor: '#00CEC9' },
  topButtonText: { color: '#00CEC9', fontWeight: 'bold' },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(24, 24, 36, 0.92)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  iconButtonText: { color: '#FFF', fontSize: 22 },
  mapTools: { position: 'absolute', left: 16, gap: 8 },
  mapStatus: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(24, 24, 36, 0.92)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  mapStatusText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  legend: { position: 'absolute', left: 16, flexDirection: 'row', gap: 12, backgroundColor: 'rgba(24, 24, 36, 0.86)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  legendText: { color: '#FFF', fontSize: 11 },
  unlockedDot: { color: '#00CEC9' },
  lockedDot: { color: '#B7BEC2' },
  
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#181824', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#6C5CE7', maxHeight: '80%' },
  modalHeader: { color: '#00CEC9', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  modalBody: { color: '#FFF', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  modalHint: { color: '#A9A9B5', fontSize: 13, marginTop: -8, marginBottom: 16 },
  
  // My Drops List
  dropsList: { marginBottom: 20 },
  dropItem: { backgroundColor: '#252538', padding: 16, borderRadius: 12, marginBottom: 10 },
  dropItemText: { color: '#FFF', fontSize: 14, marginBottom: 8, fontStyle: 'italic' },
  viewBadge: { alignSelf: 'flex-start', backgroundColor: '#6C5CE7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  viewBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },

  // Forms & Buttons
  input: { backgroundColor: '#252538', color: '#FFF', padding: 14, borderRadius: 12, height: 100, textAlignVertical: 'top', marginBottom: 6 },
  characterCount: { color: '#A9A9B5', fontSize: 12, textAlign: 'right', marginBottom: 16 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 0.48, padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#444' },
  submitBtn: { backgroundColor: '#6C5CE7' },
  disabledBtn: { opacity: 0.45 },
  closeBtn: { backgroundColor: '#FF7675', padding: 14, borderRadius: 10, alignItems: 'center' },
  closeBtnText: { color: '#FFF', fontWeight: 'bold' },
  btnText: { color: '#FFF', fontWeight: 'bold' },
});