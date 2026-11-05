import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

type DisasterType = 'flood' | 'wildfire' | 'earthquake';
type ApiState = 'checking' | 'online' | 'offline';
type Severity = 'critical' | 'moderate' | 'low' | 'high';

interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

interface AnalysisResult {
  disaster_type: string;
  impact: number;
  damage: number;
  severity: Severity;
  status: string;
}

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_DISASTERLENS_API_URL || 'https://disasterlens-api.onrender.com'
).replace(/\/$/, '');

const DISASTERS: { id: DisasterType; title: string; icon: string; accent: string }[] = [
  { id: 'flood', title: 'Flood', icon: '🌊', accent: '#39b8ff' },
  { id: 'wildfire', title: 'Wildfire', icon: '🔥', accent: '#ff985c' },
  { id: 'earthquake', title: 'Earthquake', icon: '🏚️', accent: '#f4bd58' },
];

const SEVERITY_STYLE: Record<Severity, { label: string; color: string; background: string }> = {
  critical: { label: 'CRITICAL', color: '#ff6c77', background: '#381b26' },
  high: { label: 'HIGH', color: '#ff985c', background: '#38241c' },
  moderate: { label: 'MODERATE', color: '#f4bd58', background: '#352c1b' },
  low: { label: 'LOW', color: '#67d9ab', background: '#173329' },
};

function makePickedImage(asset: ImagePicker.ImagePickerAsset): PickedImage {
  const name = asset.fileName || asset.uri.split('/').pop()?.split('?')[0] || 'satellite-image.jpg';
  const extension = name.split('.').pop()?.toLowerCase();
  const fallbackMime = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  return { uri: asset.uri, name, type: asset.mimeType || fallbackMime };
}

function MetricCard({ title, value, color }: { title: string; value: number; color: string }) {
  const amount = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{title}</Text>
      <Text style={[styles.metricValue, { color }]}>{value.toFixed(2)}<Text style={styles.percent}>%</Text></Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${amount}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

export default function App() {
  const [disasterType, setDisasterType] = useState<DisasterType>('flood');
  const [postImage, setPostImage] = useState<PickedImage | null>(null);
  const [preImage, setPreImage] = useState<PickedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiState, setApiState] = useState<ApiState>('checking');

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('API unavailable')))
      .then((health) => { if (active) setApiState(health.status === 'Online' ? 'online' : 'offline'); })
      .catch(() => { if (active) setApiState('offline'); });
    return () => { active = false; };
  }, []);

  const pickImage = async (kind: 'pre' | 'post') => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow access to your photo library to choose a satellite image.');
        return;
      }

      const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (selection.canceled || !selection.assets?.[0]) return;

      const image = makePickedImage(selection.assets[0]);
      if (kind === 'pre') setPreImage(image);
      else setPostImage(image);
      setResult(null);
      setError(null);
    } catch {
      Alert.alert('Could not open photos', 'Please try selecting the image again.');
    }
  };

  const analyzeImage = async () => {
    if (!postImage) return;
    if (disasterType !== 'flood' && !preImage) {
      setError('Add a pre-disaster reference image for wildfire or earthquake analysis.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    const appendImage = (field: string, image: PickedImage) => {
      // React Native fetch accepts this URI-backed file object for multipart uploads.
      formData.append(field, { uri: image.uri, name: image.name, type: image.type } as unknown as Blob);
    };
    appendImage('file', postImage);
    if (preImage) appendImage('file_pre', preImage);
    formData.append('disaster_type', disasterType);

    try {
      const response = await fetch(`${API_BASE_URL}/analyze/`, {
        method: 'POST',
        body: formData,
      });
      setApiState('online');

      const payload: unknown = await response.json().catch(() => ({}));
      const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      if (!response.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : `Assessment failed (${response.status}).`);
      }

      const impact = Number(data.flood_percentage);
      const damage = Number(data.damage_percentage);
      const severity = String(data.severity ?? '').toLowerCase();
      if (!Number.isFinite(impact) || !Number.isFinite(damage) || !['critical', 'moderate', 'low', 'high'].includes(severity)) {
        throw new Error('The API response did not include valid impact, damage, and severity values.');
      }

      setResult({
        disaster_type: typeof data.disaster_type === 'string' ? data.disaster_type : disasterType,
        impact,
        damage,
        severity: severity as Severity,
        status: typeof data.status === 'string' ? data.status : 'Assessment complete',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reach the DisasterLens API.');
      if (caught instanceof TypeError) setApiState('offline');
    } finally {
      setLoading(false);
    }
  };

  const selectedDisaster = DISASTERS.find((item) => item.id === disasterType)!;
  const severity = result ? SEVERITY_STYLE[result.severity] : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#07111b" />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>D</Text></View>
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>DISASTERLENS</Text>
            <Text style={styles.brandCaption}>SATELLITE FIELD ASSESSMENT</Text>
          </View>
          <View style={styles.apiPill}>
            <View style={[styles.apiDot, { backgroundColor: apiState === 'online' ? '#57d7a0' : apiState === 'offline' ? '#ff747b' : '#f3bf5f' }]} />
            <Text style={styles.apiLabel}>{apiState === 'online' ? 'API READY' : apiState === 'offline' ? 'API OFFLINE' : 'CHECKING'}</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.kicker}>FIELD TOOL · 01</Text>
          <Text style={styles.title}>Assess an affected area</Text>
          <Text style={styles.subtitle}>Choose a disaster type and upload satellite imagery for an AI assessment.</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionNumber}>01</Text>
            <Text style={styles.sectionTitle}>Disaster type</Text>
          </View>
          <View style={styles.typeRow}>
            {DISASTERS.map((item) => {
              const active = disasterType === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => { setDisasterType(item.id); setResult(null); setError(null); }}
                  style={[styles.typeButton, active && { borderColor: item.accent, backgroundColor: `${item.accent}18` }]}
                >
                  <Text style={styles.typeIcon}>{item.icon}</Text>
                  <Text style={[styles.typeText, active && { color: item.accent }]}>{item.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionNumber}>02</Text>
            <Text style={styles.sectionTitle}>Satellite imagery</Text>
          </View>
          <UploadCard
            title={disasterType === 'flood' ? 'Post-disaster image' : 'Post-disaster image · T1'}
            hint="Select the image captured after the event"
            image={postImage}
            accent={selectedDisaster.accent}
            onPress={() => pickImage('post')}
          />
          {disasterType !== 'flood' && (
            <UploadCard
              title="Pre-disaster reference · T0"
              hint="Select a baseline image from before the event"
              image={preImage}
              accent="#f4bd58"
              onPress={() => pickImage('pre')}
            />
          )}
          <Text style={styles.helperText}>
            {disasterType === 'flood' ? 'Flood assessment uses one image.' : 'Change analysis compares the before and after images.'}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={analyzeImage}
          disabled={!postImage || loading || (disasterType !== 'flood' && !preImage)}
          style={[styles.analyzeButton, (!postImage || loading || (disasterType !== 'flood' && !preImage)) && styles.buttonDisabled]}
        >
          {loading ? <ActivityIndicator color="#07111b" /> : <Text style={styles.analyzeText}>RUN ASSESSMENT  →</Text>}
        </TouchableOpacity>

        {error && <View accessibilityRole="alert" style={styles.errorCard}><Text style={styles.errorIcon}>!</Text><Text style={styles.errorText}>{error}</Text></View>}

        {result && severity && (
          <View style={styles.results}>
            <View style={styles.resultHeading}>
              <View>
                <Text style={styles.kicker}>ASSESSMENT COMPLETE</Text>
                <Text style={styles.resultTitle}>{result.disaster_type} impact</Text>
              </View>
              <View style={[styles.severityBadge, { backgroundColor: severity.background }]}>
                <Text style={[styles.severityText, { color: severity.color }]}>{severity.label}</Text>
              </View>
            </View>
            <View style={styles.metricRow}>
              <MetricCard title="Impact estimate" value={result.impact} color={selectedDisaster.accent} />
              <MetricCard title="Damage estimate" value={result.damage} color={severity.color} />
            </View>
            <Text style={styles.resultStatus}>{result.status}</Text>
            <Text style={styles.disclaimer}>Image-based percentages; the API does not return geographic area, confidence, or a mapped damage layer.</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>DISASTERLENS · DECISION SUPPORT</Text>
          <Text style={styles.footerNote}>Review model assessments alongside field evidence.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UploadCard({ title, hint, image, accent, onPress }: { title: string; hint: string; image: PickedImage | null; accent: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.uploadCard, { borderColor: image ? `${accent}75` : '#263746' }]}>
      {image ? (
        <>
          <Image source={{ uri: image.uri }} style={styles.previewImage} />
          <View style={styles.imageCaption}>
            <Text numberOfLines={1} style={styles.imageName}>{image.name}</Text>
            <Text style={[styles.imageReplace, { color: accent }]}>TAP TO REPLACE</Text>
          </View>
        </>
      ) : (
        <View style={styles.uploadEmpty}>
          <View style={[styles.uploadIconBox, { backgroundColor: `${accent}18` }]}><Text style={styles.uploadIcon}>＋</Text></View>
          <View style={styles.uploadCopy}>
            <Text style={styles.uploadTitle}>{title}</Text>
            <Text style={styles.uploadHint}>{hint}</Text>
          </View>
          <Text style={styles.uploadChevron}>›</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07111b' },
  page: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, maxWidth: 620, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 34 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#102a3b', borderWidth: 1, borderColor: '#1a465e', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#4ac8ed', fontSize: 20, fontWeight: '900' },
  brandCopy: { marginLeft: 10, flex: 1 },
  brand: { color: '#eaf4fa', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  brandCaption: { color: '#6d899c', fontSize: 8, letterSpacing: 1.3, marginTop: 3 },
  apiPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 20, backgroundColor: '#10202d', borderWidth: 1, borderColor: '#203442' },
  apiDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  apiLabel: { color: '#a8bfce', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  intro: { marginBottom: 28 },
  kicker: { color: '#4ac8ed', fontSize: 9, fontWeight: '800', letterSpacing: 1.8, marginBottom: 8 },
  title: { color: '#f1f7fb', fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: '#90a6b5', fontSize: 13, lineHeight: 20, marginTop: 8, maxWidth: 360 },
  section: { marginBottom: 24 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionNumber: { color: '#4ac8ed', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginRight: 9 },
  sectionTitle: { color: '#d9e7ef', fontSize: 14, fontWeight: '700' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: { flex: 1, minHeight: 73, borderRadius: 14, backgroundColor: '#0b1a27', borderWidth: 1, borderColor: '#203442', alignItems: 'center', justifyContent: 'center' },
  typeIcon: { fontSize: 20, marginBottom: 5 },
  typeText: { color: '#93aab9', fontSize: 11, fontWeight: '700' },
  uploadCard: { backgroundColor: '#0b1a27', borderRadius: 15, borderWidth: 1, borderStyle: 'dashed', overflow: 'hidden', marginBottom: 10 },
  uploadEmpty: { minHeight: 86, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  uploadIconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  uploadIcon: { color: '#50caec', fontSize: 25, fontWeight: '300', lineHeight: 29 },
  uploadCopy: { flex: 1, marginHorizontal: 12 },
  uploadTitle: { color: '#dceaf1', fontSize: 12, fontWeight: '700' },
  uploadHint: { color: '#708899', fontSize: 10, lineHeight: 15, marginTop: 4 },
  uploadChevron: { color: '#718a9c', fontSize: 25 },
  previewImage: { width: '100%', height: 190, resizeMode: 'cover' },
  imageCaption: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  imageName: { color: '#dceaf1', fontSize: 11, flex: 1, marginRight: 10 },
  imageReplace: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  helperText: { color: '#6d8494', fontSize: 10, lineHeight: 15, marginTop: 1 },
  analyzeButton: { height: 52, borderRadius: 14, backgroundColor: '#50caec', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  buttonDisabled: { backgroundColor: '#183142' },
  analyzeText: { color: '#07111b', fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  errorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#321b24', borderColor: '#63313d', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  errorIcon: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#642d3b', color: '#ff9aa2', fontWeight: '900', marginRight: 9 },
  errorText: { color: '#ffc4c7', fontSize: 11, lineHeight: 16, flex: 1 },
  results: { backgroundColor: '#0b1a27', borderRadius: 16, borderWidth: 1, borderColor: '#203746', padding: 15, marginTop: 2 },
  resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  resultTitle: { color: '#eaf4fa', fontSize: 17, fontWeight: '800', marginTop: 1 },
  severityBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  severityText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  metricRow: { flexDirection: 'row', gap: 9 },
  metricCard: { flex: 1, backgroundColor: '#07111b', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#192d3a' },
  metricLabel: { color: '#7d95a5', fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginBottom: 7 },
  metricValue: { fontSize: 21, fontWeight: '800' },
  percent: { fontSize: 12, fontWeight: '700' },
  track: { height: 4, borderRadius: 3, backgroundColor: '#1d303e', marginTop: 9, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  resultStatus: { color: '#85a0b1', fontSize: 9, marginTop: 12 },
  disclaimer: { color: '#637d8e', fontSize: 9, lineHeight: 14, marginTop: 10 },
  footer: { borderTopWidth: 1, borderTopColor: '#1b2c38', paddingTop: 16, marginTop: 28 },
  footerText: { color: '#607b8c', fontSize: 8, fontWeight: '800', letterSpacing: 1.3 },
  footerNote: { color: '#607b8c', fontSize: 9, marginTop: 5 },
});
