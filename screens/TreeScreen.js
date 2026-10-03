import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, Animated, PanResponder } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import { buildGraph, describeRelation, relationText } from '../lib/relationships';
import { layoutTree, NODE_W, NODE_H, TOGGLE_SIZE } from '../lib/treeLayout';
import { formatPersonMeta } from '../lib/personHelpers';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const PHOTO_SIZE = 64;
const PHOTOS_SETTING_KEY = 'tree.showPhotos'; // remembers names vs pictures on this phone

function personLabel(p) {
  return p?.name_en || p?.name_pinyin || p?.name_cn || '(no name)';
}

// Short line under a name in the tree: years only, so it fits in the box
function yearsText(p) {
  const born = p.birth_date ? p.birth_date.slice(0, 4) : null;
  const died = p.death_date ? p.death_date.slice(0, 4) : null;
  if (born && died) return `${born} – ${died}`;
  if (born) return p.is_deceased ? `${born} –` : `b. ${born}`;
  if (died) return `d. ${died}`;
  return p.is_deceased ? 'Deceased' : '';
}

function clampZoom(s) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));
}

export default function TreeScreen({ route, navigation }) {
  const { familyId, familyName, focusPersonId } = route.params;

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [graveIds, setGraveIds] = useState([]); // person ids that have a grave record
  const [selfPersonId, setSelfPersonId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [viewportReady, setViewportReady] = useState(false);
  const [photos, setPhotos] = useState({}); // person id -> their first biography photo
  const [showPhotos, setShowPhotos] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PHOTOS_SETTING_KEY)
      .then((value) => setShowPhotos(value === 'true'))
      .catch(() => {});
  }, []);

  function togglePhotos() {
    const next = !showPhotos;
    setShowPhotos(next);
    AsyncStorage.setItem(PHOTOS_SETTING_KEY, String(next)).catch(() => {});
  }

  const loadEverything = useCallback(async () => {
    const { data: peopleData, error: peopleErr } = await supabase
      .from('persons')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });
    if (peopleErr) {
      Alert.alert('Error loading family', peopleErr.message);
      setLoading(false);
      return;
    }
    const ids = (peopleData || []).map((p) => p.id);

    let relData = [];
    let graveData = [];
    let bioData = [];
    if (ids.length) {
      const [rels, graves, bios] = await Promise.all([
        supabase.from('person_relationships').select('*').in('person_id', ids),
        supabase.from('graves').select('person_id').in('person_id', ids),
        supabase.from('biographies').select('person_id, photo_urls').in('person_id', ids),
      ]);
      if (rels.error) Alert.alert('Error loading links', rels.error.message);
      relData = rels.data || [];
      graveData = graves.data || [];
      bioData = bios.data || [];
    }
    const photoMap = {};
    bioData.forEach((b) => {
      const first = (b.photo_urls || []).find((u) => typeof u === 'string' && u.startsWith('https://'));
      if (first) photoMap[b.person_id] = first;
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const me = user ? (peopleData || []).find((p) => p.linked_user_id === user.id) : null;

    setPeople(peopleData || []);
    setRelationships(relData);
    setGraveIds(graveData.map((g) => g.person_id));
    setPhotos(photoMap);
    setSelfPersonId(me ? me.id : null);
    setLoading(false);
  }, [familyId]);

  // Re-loads every time this screen comes into view, so edits made on a
  // Person screen show up when you come back.
  useFocusEffect(
    useCallback(() => {
      loadEverything();
    }, [loadEverything])
  );

  const graph = useMemo(() => buildGraph(people, relationships), [people, relationships]);
  const layout = useMemo(() => layoutTree(people, graph, collapsed), [people, graph, collapsed]);

  // ---- moving and zooming the drawing ----
  // view = where the drawing sits: s is the zoom, tx/ty is where its top-left
  // corner is on screen. Kept outside React state so dragging stays smooth.
  const view = useRef({ s: 1, tx: 0, ty: 0 }).current;
  const anim = useRef({ x: new Animated.Value(0), y: new Animated.Value(0), s: new Animated.Value(1) }).current;
  const viewport = useRef({ x: 0, y: 0, w: 0, h: 0 }).current;
  const viewportRef = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const frame = useRef(null);
  const gesture = useRef({ count: 0 }).current;

  // React Native scales a view around its centre, so shift it back to behave
  // as if it scaled from the top-left corner.
  function apply() {
    const { width, height } = layoutRef.current;
    anim.s.setValue(view.s);
    anim.x.setValue(view.tx + ((view.s - 1) * width) / 2);
    anim.y.setValue(view.ty + ((view.s - 1) * height) / 2);
  }

  function stopGlide() {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
  }

  function moveTo(target, animated = true) {
    stopGlide();
    if (!animated) {
      Object.assign(view, target);
      apply();
      return;
    }
    const from = { ...view };
    const started = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / 260);
      const ease = 1 - (1 - t) * (1 - t);
      view.s = from.s + (target.s - from.s) * ease;
      view.tx = from.tx + (target.tx - from.tx) * ease;
      view.ty = from.ty + (target.ty - from.ty) * ease;
      apply();
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  }

  function fitAll(animated = true) {
    const { width, height } = layoutRef.current;
    const s = clampZoom(Math.min(viewport.w / width, viewport.h / height, 1));
    moveTo({ s, tx: (viewport.w - width * s) / 2, ty: Math.max(0, (viewport.h - height * s) / 2) }, animated);
  }

  function centreOn(personId, animated = true) {
    const p = layoutRef.current.pos[personId];
    if (!p) return;
    const s = 1;
    moveTo(
      {
        s,
        tx: viewport.w / 2 - (p.x + NODE_W / 2) * s,
        // a little above the middle, so the info card at the bottom doesn't cover them
        ty: viewport.h * 0.35 - (p.y + NODE_H / 2) * s,
      },
      animated
    );
  }

  function zoomBy(factor) {
    const s = clampZoom(view.s * factor);
    const cx = (viewport.w / 2 - view.tx) / view.s;
    const cy = (viewport.h / 2 - view.ty) / view.s;
    moveTo({ s, tx: viewport.w / 2 - cx * s, ty: viewport.h / 2 - cy * s });
  }

  // One finger drags, two fingers pinch. Plain taps are left alone so they
  // still reach the person boxes.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2,
      onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.touches.length >= 2 || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onMoveShouldSetPanResponderCapture: (e, g) => e.nativeEvent.touches.length >= 2 || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        stopGlide();
        gesture.count = 0;
      },
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        const count = Math.min(touches.length, 2);
        if (count === 0) return;
        const a = touches[0];
        const b = touches[1];
        const mid = b
          ? { x: (a.pageX + b.pageX) / 2 - viewport.x, y: (a.pageY + b.pageY) / 2 - viewport.y }
          : { x: a.pageX - viewport.x, y: a.pageY - viewport.y };
        const dist = b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1 : 1;

        // a finger was added or lifted: start measuring again from here
        if (count !== gesture.count) {
          Object.assign(gesture, { count, mid, dist, s: view.s, tx: view.tx, ty: view.ty });
          return;
        }

        const s = b ? clampZoom((gesture.s * dist) / gesture.dist) : gesture.s;
        // keep the same spot of the drawing under the fingers
        const cx = (gesture.mid.x - gesture.tx) / gesture.s;
        const cy = (gesture.mid.y - gesture.ty) / gesture.s;
        view.s = s;
        view.tx = mid.x - cx * s;
        view.ty = mid.y - cy * s;
        apply();
      },
    })
  ).current;

  useEffect(() => stopGlide, []);

  // Where to look when the tree first opens: the person we were sent to (from
  // a Person screen), otherwise the whole tree, or "you" if it's too big to fit.
  const openedFor = useRef(null);
  useEffect(() => {
    if (loading || !viewportReady || people.length === 0) return;
    const key = focusPersonId || 'whole-tree';
    if (openedFor.current === key) return;
    openedFor.current = key;

    if (focusPersonId && layout.pos[focusPersonId]) {
      setSelectedId(focusPersonId);
      centreOn(focusPersonId, false);
      return;
    }
    const fits = Math.min(viewport.w / layout.width, viewport.h / layout.height) >= 0.6;
    if (!fits && selfPersonId && layout.pos[selfPersonId]) centreOn(selfPersonId, false);
    else fitAll(false);
  }, [loading, viewportReady, focusPersonId, people.length]);

  // When a branch is opened or closed, everything shifts — keep the tapped
  // couple in the same place on screen so the tree doesn't seem to jump.
  const anchor = useRef(null);
  useLayoutEffect(() => {
    const now = anchor.current && layout.pos[anchor.current.id];
    if (now) {
      view.tx -= (now.x - anchor.current.x) * view.s;
      view.ty -= (now.y - anchor.current.y) * view.s;
    }
    anchor.current = null;
    apply();
  }, [layout]);

  function toggleBranch(toggle) {
    stopGlide();
    const at = layout.pos[toggle.anchorId];
    anchor.current = at ? { id: toggle.anchorId, x: at.x, y: at.y } : null;
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(toggle.key)) next.delete(toggle.key);
      else next.add(toggle.key);
      return next;
    });
  }

  function onViewportLayout() {
    viewportRef.current?.measureInWindow((x, y, w, h) => {
      Object.assign(viewport, { x, y, w, h });
      if (w > 0 && h > 0) setViewportReady(true);
    });
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (people.length === 0) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <EmptyState
            icon="git-network-outline"
            title="No one in this tree yet"
            message="Add people to this family first, then come back to see them laid out as a tree."
          />
          <AppButton title="Back to the family list" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  // someone folded away inside a closed branch can't stay selected
  const selected = selectedId && layout.pos[selectedId] ? graph.byId.get(selectedId) : null;
  const selectedRelation = selected ? describeRelation(graph, selfPersonId, selected.id) : null;

  const controls = [
    { key: 'in', icon: 'add', label: 'Zoom in', onPress: () => zoomBy(1.4) },
    { key: 'out', icon: 'remove', label: 'Zoom out', onPress: () => zoomBy(1 / 1.4) },
    { key: 'fit', icon: 'scan-outline', label: 'Show the whole tree', onPress: () => fitAll() },
    // shows what tapping will switch TO: a picture icon while names are showing, and back
    {
      key: 'photos',
      icon: showPhotos ? 'text-outline' : 'image-outline',
      label: showPhotos ? 'Show names' : 'Show pictures',
      onPress: togglePhotos,
    },
  ];
  if (selfPersonId && layout.pos[selfPersonId]) {
    controls.push({
      key: 'me',
      icon: 'locate-outline',
      label: 'Find me in the tree',
      onPress: () => {
        setSelectedId(selfPersonId);
        centreOn(selfPersonId);
      },
    });
  }

  return (
    <Screen scroll={false} keyboardAvoiding={false} contentContainerStyle={styles.screen}>
      <View ref={viewportRef} style={styles.viewport} onLayout={onViewportLayout} {...pan.panHandlers}>
        <Animated.View
          style={[
            styles.canvas,
            { width: layout.width, height: layout.height },
            { transform: [{ translateX: anim.x }, { translateY: anim.y }, { scale: anim.s }] },
          ]}
        >
          {layout.lines.map((l, i) => (
            <View key={i} style={[styles.line, { left: l.x, top: l.y, width: l.w, height: l.h }]} />
          ))}

          {layout.nodes.map((node) => {
            const p = graph.byId.get(node.id);
            const isSelected = node.id === selectedId;
            const isSelf = node.id === selfPersonId;
            const years = yearsText(p);
            const photo = showPhotos ? photos[node.id] : null;
            return (
              <Pressable
                key={node.id}
                style={[
                  styles.node,
                  { left: node.x, top: node.y },
                  p.is_deceased && styles.nodeDeceased,
                  isSelf && styles.nodeSelf,
                  isSelected && styles.nodeSelected,
                ]}
                onPress={() => setSelectedId(node.id)}
                accessibilityRole="button"
                accessibilityLabel={personLabel(p)}
              >
                {photo ? (
                  <Avatar uri={photo} size={PHOTO_SIZE} />
                ) : (
                  <>
                    <Text allowFontScaling={false} numberOfLines={2} style={styles.nodeName}>
                      {personLabel(p)}
                    </Text>
                    {years ? (
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.nodeYears}>
                        {years}
                      </Text>
                    ) : null}
                  </>
                )}
                {isSelf ? (
                  <View style={styles.youBadge}>
                    <Text allowFontScaling={false} style={styles.youBadgeText}>You</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}

          {layout.toggles.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.toggle, { left: t.x, top: t.y }, t.collapsed && styles.toggleClosed]}
              onPress={() => toggleBranch(t)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t.collapsed ? `Show ${t.count} hidden relatives` : 'Hide this branch'}
            >
              {t.collapsed ? (
                <Text allowFontScaling={false} style={styles.toggleText}>+{t.count}</Text>
              ) : (
                <Ionicons name="chevron-up" size={16} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </Animated.View>

        <View style={styles.controls} pointerEvents="box-none">
          {controls.map((c) => (
            <Pressable
              key={c.key}
              style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}
              onPress={c.onPress}
              accessibilityRole="button"
              accessibilityLabel={c.label}
            >
              <Ionicons name={c.icon} size={22} color={colors.primary} />
            </Pressable>
          ))}
        </View>

        {!selected ? (
          <Text style={styles.hint} pointerEvents="none">
            Drag to move · pinch to zoom · tap a person
          </Text>
        ) : null}
      </View>

      {selected ? (
        <View style={styles.infoCard}>
          <View style={styles.infoTop}>
            <Avatar name={personLabel(selected)} size={44} uri={photos[selected.id]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoName}>{personLabel(selected)}</Text>
              {selected.id === selfPersonId ? (
                <Text style={styles.infoRelation}>This is you</Text>
              ) : selectedRelation ? (
                <Text style={styles.infoRelation}>{relationText(selectedRelation)}</Text>
              ) : null}
              {formatPersonMeta(selected) ? <Text style={styles.infoMeta}>{formatPersonMeta(selected)}</Text> : null}
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              onPress={() => setSelectedId(null)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.infoButtons}>
            <AppButton
              title="Open profile"
              icon="person-outline"
              compact
              style={{ flex: 1 }}
              onPress={() =>
                navigation.push('Person', { familyId, familyName, personId: selected.id, personName: personLabel(selected) })
              }
            />
            {graveIds.includes(selected.id) ? (
              <AppButton
                title="Directions"
                icon="map-outline"
                variant="secondary"
                compact
                style={{ flex: 1 }}
                onPress={() => navigation.navigate('GraveRoute', { personId: selected.id, personName: personLabel(selected) })}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  pressed: { opacity: 0.6 },
  screen: { paddingHorizontal: 0 },
  viewport: { flex: 1, overflow: 'hidden' },
  canvas: { position: 'absolute', left: 0, top: 0 },
  line: { position: 'absolute', backgroundColor: colors.border },
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  nodeDeceased: { backgroundColor: colors.surfaceAlt },
  nodeSelf: { borderWidth: 2, borderColor: colors.accent },
  nodeSelected: { borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  nodeName: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium, textAlign: 'center' },
  nodeYears: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, textAlign: 'center' },
  youBadge: { position: 'absolute', top: -9, right: 8, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  youBadgeText: { color: colors.primaryDark, fontSize: 11, fontWeight: fontWeight.bold },
  toggle: {
    position: 'absolute',
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: TOGGLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  toggleClosed: { backgroundColor: colors.primary },
  toggleText: { color: colors.textOnPrimary, fontSize: 11, fontWeight: fontWeight.bold },
  controls: { position: 'absolute', top: spacing.sm, right: spacing.sm, gap: spacing.sm },
  controlButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.floating,
  },
  hint: { position: 'absolute', left: 0, right: 0, bottom: spacing.sm, textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs },
  infoCard: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  infoName: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  infoRelation: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: 2 },
  infoMeta: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  closeButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  infoButtons: { flexDirection: 'row', gap: spacing.sm },
});
