import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Share, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as supabaseModule from '../lib/supabase';
import { MEMORIAL_BASE_URL } from '../lib/qrConfig';

// works whether lib/supabase.js exports the client by name or as default
const supabase = supabaseModule.supabase || supabaseModule.default;

const TIPS =
  "1. Print at least 5 cm x 5 cm, black on white, with a white border around it. Don't shrink it or put a logo on it.\n" +
  "2. Best: a laser printer (toner resists water better than home inkjet) on waterproof sticker paper. Or ask a signage/trophy shop for an engraved metal or acrylic plaque; it can last for years.\n" +
  "3. If laminating: use matte, UV-resistant laminate (less glare when scanning) and seal the edges with a 3-5 mm border so water can't creep in.\n" +
  "4. Test-scan it after printing/laminating, and again at the grave in daylight.\n" +
  "5. Stick it on a clean, flat spot with outdoor-grade adhesive (weatherproof double-sided tape or silicone), away from the carved name.\n" +
  "6. Ask the older relatives and the cemetery first; some have rules about what can be attached to a grave.\n" +
  "7. Sun and rain wear things out. Check it every Ching Ming. You can share a fresh copy from this screen any time.";

function Btn({ label, onPress, light }) {
  return (
    <TouchableOpacity style={[styles.btn, light && styles.btnLight]} onPress={onPress}>
      <Text style={[styles.btnText, light && styles.btnTextLight]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function GraveQRScreen({ route, navigation }) {
  const params = route.params || {};
  const personId = params.personId || params.person_id || (params.person && params.person.id) || params.id;

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [grave, setGrave] = useState(null);
 const [error, setError] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [blockMsg, setBlockMsg] = useState('');
  const [years, setYears] = useState('');
  const [showTips, setShowTips] = useState(false);
  const cardRef = useRef(null);
 const insets = useSafeAreaInsets();

  useEffect(() => {
    async function load() {
      if (!personId) {
        setError("I couldn't tell which person this is.");
        setLoading(false);
        return;
      }
      const { data: person } = await supabase.from('persons').select('*').eq('id', personId).maybeSingle();
            if (!person) { setError("I couldn't find this person."); setLoading(false); return; }
      setName(person.name || person.name_cn || person.name_en || person.name_pinyin || '');
      const by = person.birth_date ? person.birth_date.slice(0, 4) : '';
      const dy = person.death_date ? person.death_date.slice(0, 4) : '';
      if (by || dy) setYears((by || '?') + ' – ' + (dy || '?'));
      if (!person.is_deceased) {
        setBlockMsg('QR codes can only be made for people marked as deceased.');
        setLoading(false);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData && userData.user ? userData.user.id : null;
      let isAdmin = false;
      if (uid) {
        const { data: member } = await supabase
          .from('family_members')
          .select('role')
          .eq('family_id', person.family_id)
          .eq('user_id', uid)
          .maybeSingle();
        isAdmin = !!member && member.role === 'admin';
      }
      if (!isAdmin) {
        setBlockMsg('Only a family admin can create QR codes. Ask an admin of this family.');
        setLoading(false);
        return;
      }
      setAllowed(true);
      const { data: g, error: gErr } = await supabase
        .from('graves')
        .select('id, qr_code_uuid, cemetery_name')
        .eq('person_id', personId)
        .limit(1)
        .maybeSingle();
      if (gErr) setError(gErr.message);
      else setGrave(g);
      setLoading(false);
    }
    load();
  }, [personId]);

  const notSet = MEMORIAL_BASE_URL.includes('PASTE');

  async function shareImage() {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        setError('Sharing is not available on this phone.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share QR code' });
    } catch (e) {
      setError('Could not share the picture: ' + e.message);
    }
  }
  const url = grave && grave.qr_code_uuid
    ? MEMORIAL_BASE_URL.replace(/\/+$/, '') + '/?q=' + grave.qr_code_uuid
    : '';

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: 40 + insets.bottom }]}>
      {loading && <ActivityIndicator size="large" />}
      {!!error && <Text style={styles.warn}>{error}</Text>}
      {!!blockMsg && <Text style={styles.sub}>{blockMsg}</Text>}
      {!loading && !error && allowed && !grave && (
        <Text style={styles.sub}>
          No grave saved for this person yet. Go back, tap "Grave", and add the cemetery first.
        </Text>
      )}
      {!!url && (
        <>
          {notSet && <Text style={styles.warn}>Open lib/qrConfig.js and paste your Netlify address first.</Text>}
          <View ref={cardRef} collapsable={false} style={styles.printCard}>
            <View style={styles.qrBox}>
              <QRCode value={url} size={240} backgroundColor="white" color="black" />
            </View>
            {!!name && <Text style={styles.cardName}>{name}</Text>}
            {!!years && <Text style={styles.cardYears}>{years}</Text>}
            <Text style={styles.cardCaption}>Scan to remember their story</Text>
          </View>
          {!!grave.cemetery_name && <Text style={styles.sub}>{grave.cemetery_name}</Text>}
          <Text style={styles.url} selectable>{url}</Text>
          <Btn label="Open page in browser" onPress={() => Linking.openURL(url)} />
          <Btn label="Share printable QR (WhatsApp, email…)" onPress={shareImage} />
          <Btn label="Share link only" light onPress={() => Share.share({ message: (name ? name + ' — ' : '') + url })} />
          <Btn label={showTips ? 'Hide tips' : 'Tips: making it last on the grave'} light onPress={() => setShowTips(!showTips)} />
          {showTips && <Text style={styles.tips}>{TIPS}</Text>}
        </>
      )}
      <Btn label="Back" light onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center' },
  qrBox: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginTop: 16 },
  name: { fontSize: 22, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
  sub: { color: '#666', marginTop: 8, textAlign: 'center' },
  url: { color: '#666', fontSize: 12, marginTop: 16, marginBottom: 8, textAlign: 'center' },
  warn: { color: '#b00020', textAlign: 'center', marginTop: 12 },
  printCard: { backgroundColor: 'white', padding: 20, alignItems: 'center', borderRadius: 12, marginTop: 8 },
  cardName: { fontSize: 22, fontWeight: 'bold', color: '#222', marginTop: 12, textAlign: 'center' },
  cardYears: { color: '#555', marginTop: 2 },
  cardCaption: { color: '#555', fontSize: 13, marginTop: 8 },
  tips: { color: '#444', fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'left' },
  btn: { backgroundColor: '#8a2c2c', paddingVertical: 12, borderRadius: 8, marginTop: 12, width: '100%' },
  btnLight: { backgroundColor: '#ddd' },
  btnText: { color: 'white', textAlign: 'center', fontWeight: '600' },
  btnTextLight: { color: '#222' },
});