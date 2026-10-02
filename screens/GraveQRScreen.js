import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Linking, Share, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../lib/supabase';
import { MEMORIAL_BASE_URL } from '../lib/qrConfig';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../lib/theme';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import EmptyState from '../components/EmptyState';

const TIPS = [
  "Print at least 5 cm x 5 cm, black on white, with a white border around it. Don't shrink it or put a logo on it.",
  'Best: a laser printer (toner resists water better than home inkjet) on waterproof sticker paper. Or ask a signage/trophy shop for an engraved metal or acrylic plaque; it can last for years.',
  "If laminating: use matte, UV-resistant laminate (less glare when scanning) and seal the edges with a 3-5 mm border so water can't creep in.",
  'Test-scan it after printing/laminating, and again at the grave in daylight.',
  'Stick it on a clean, flat spot with outdoor-grade adhesive (weatherproof double-sided tape or silicone), away from the carved name.',
  'Ask the older relatives and the cemetery first; some have rules about what can be attached to a grave.',
  'Sun and rain wear things out. Check it every Ching Ming. You can share a fresh copy from this screen any time.',
];

export default function GraveQRScreen({ route }) {
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
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    async function load() {
      if (!personId) {
        setError("I couldn't tell which person this is.");
        setLoading(false);
        return;
      }
      const { data: person } = await supabase.from('persons').select('*').eq('id', personId).maybeSingle();
      if (!person) { setError("I couldn't find this person."); setLoading(false); return; }
      setName(person.name_en || person.name_pinyin || person.name_cn || '');
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
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        setError('Sharing is not available on this phone.');
      } else {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share QR code', UTI: 'public.png' });
      }
    } catch (e) {
      setError('Could not share the picture: ' + e.message);
    }
    setSharing(false);
  }

  const url = grave && grave.qr_code_uuid
    ? MEMORIAL_BASE_URL.replace(/\/+$/, '') + '/?q=' + grave.qr_code_uuid
    : '';

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Screen contentContainerStyle={styles.content}>
      {!!error && <Text style={styles.warn}>{error}</Text>}
      {!!blockMsg && <EmptyState icon="lock-closed-outline" title="Not available" message={blockMsg} />}
      {!error && allowed && !grave && (
        <EmptyState
          icon="map-outline"
          title="No grave saved yet"
          message={'Go back, tap "Add directions", and add the cemetery first. Then the QR code will appear here.'}
        />
      )}
      {!!url && (
        <>
          {notSet && <Text style={styles.warn}>Open lib/qrConfig.js and paste your Netlify address first.</Text>}
          {/* stays plain black-on-white on purpose: this exact card is what gets printed */}
          <View ref={cardRef} collapsable={false} style={styles.printCard}>
            <View style={styles.qrBox}>
              <QRCode value={url} size={220} backgroundColor="white" color="black" />
            </View>
            {!!name && <Text style={styles.cardName}>{name}</Text>}
            {!!years && <Text style={styles.cardYears}>{years}</Text>}
            <Text style={styles.cardCaption}>Scan to remember their story</Text>
          </View>
          {!!grave.cemetery_name && <Text style={styles.sub}>{grave.cemetery_name}</Text>}

          <AppButton
            title="Share printable QR"
            icon="share-outline"
            onPress={shareImage}
            loading={sharing}
            style={styles.button}
          />
          <AppButton
            title="Share the link only"
            variant="secondary"
            icon="link-outline"
            onPress={() => Share.share({ message: (name ? name + ' — ' : '') + url })}
            style={styles.button}
          />
          <AppButton
            title="Preview the memorial page"
            variant="secondary"
            icon="open-outline"
            onPress={() => Linking.openURL(url).catch(() => setError('Could not open the page.'))}
            style={styles.button}
          />
          <Text style={styles.url} selectable>{url}</Text>

          <AppButton
            title={showTips ? 'Hide tips' : 'Tips: making it last on the grave'}
            variant="ghost"
            icon={showTips ? 'chevron-up' : 'bulb-outline'}
            onPress={() => setShowTips(!showTips)}
            style={styles.button}
          />
          {showTips && (
            <View style={styles.tipsCard}>
              {TIPS.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipNumber}>{i + 1}.</Text>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  sub: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm, marginBottom: spacing.sm, textAlign: 'center' },
  url: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md, textAlign: 'center' },
  warn: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.md },
  printCard: {
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: spacing.lg,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  qrBox: { backgroundColor: 'white', padding: spacing.sm },
  cardName: { fontSize: 22, fontWeight: 'bold', color: '#222', marginTop: spacing.sm + 4, textAlign: 'center' },
  cardYears: { color: '#555', marginTop: 2 },
  cardCaption: { color: '#555', fontSize: 13, marginTop: spacing.sm },
  button: { marginTop: spacing.sm + 4 },
  tipsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  tipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tipNumber: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.bold, minWidth: 18 },
  tipText: { flex: 1, color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
});
