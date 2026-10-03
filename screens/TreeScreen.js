import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, Animated, PanResponder } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import { buildGraph, describeRelation, relationText } from '../lib/relationships';
import { layoutTree, familyView, NODE_W, NODE_H, TOGGLE_SIZE } from '../lib/treeLayout';
import { formatPersonMeta } from '../lib/personHelpers';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
const PHOTO_SIZE = 72;
const HANDLE_W = 124; // "▲ Dad's side" button above a person
const HANDLE_H = 28;
const CLOSER_W = 72; // "Hide" button under parents that were opened
const PHOTOS_SETTING_KEY = 'tree.showPhotos'; // remembers names vs pictures on this phone
const NO_FOLDS = new Set();

function personLabel(p) {
  return p?.name_en || p?.name_pinyin || p?.name_cn || '(no name)';
}

function isPlaceholder(p) {
  return (p?.name_en || '').startsWith('Unknown parent of');
}

function firstName(p) {
  const name = personLabel(p);
  return name.length > 12 ? `${name.split(' ')[0].slice(0, 12)}` : name;
}

// Short line under a name in the tree: years only, so it fits in the box
function yearsText(p) {
  const born = p.birth_date ? p.birth_date.slice(0, 4) : null;
  const died = p.death_date ? p.death_date.slice(0, 4) : null;
  if (born && died) return `${born} – ${died}`;
  if (born) return p.is_deceased ? `${born} –` : `b. ${born}`;
  if (died) return `d. ${died}`;
  return p.is_deceased ? 'In memory' : '';
}

function clampZoom(s) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));
}

// Two ways to look at the family:
// - "my family" (default): starts with one person's immediate family — you,
//   unless opened from someone's Person screen. "▲ Dad's side" / "▲ Mum's side"
//   buttons open each side upwards, dad's family on the left, mum's on the right.
// - "everyone": the whole family at once, with fold buttons under each couple.
export default function TreeScreen({ route, navigation }) {
  const { familyId, familyName, focusPersonId } = route.params;

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [graveIds, setGraveIds] = useState([]); // person ids that have a grave record
  const [selfPersonId, setSelfPersonId] = useState(null);
  const [selectedId, setSelectedId] = useState(focusPersonId || null);
  const [viewportReady, setViewportReady] = useState(false);
  const [photos, setPhotos] = useState({}); // person id -> their first biography photo
  const [showPhotos, setShowPhotos] = useState(false);
  const [mode, setMode] = useState('family'); // 'family' | 'everyone'
  const [centreId, setCentreId] = useState(focusPersonId || null); // null = you
  const [openIds, setOpenIds] = useState(() => new Set()); // people whose parents' side is open
  const [collapsed, setCollapsed] = useState(() => new Set()); // folded branches in "everyone"

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

  // whose immediate family the "my family" view starts from
  const centre = [centreId, selfPersonId, people[0]?.id].find((id) => id && graph.byId.has(id)) || null;

  const view$ = useMemo(() => {
    if (mode !== 'family' || !centre) return null;
    return familyView(graph, centre, openIds);
  }, [mode, graph, centre, openIds]);

  const layout = useMemo(() => {
    if (!view$) return layoutTree(people, graph, collapsed, { anchorId: selfPersonId || centre });
    const shown = people.filter((p) => view$.visible.has(p.id));
    return layoutTree(shown, buildGraph(shown, relationships), NO_FOLDS, { anchorId: centre });
  }, [view$, people, graph, relationships, collapsed, selfPersonId, centre]);

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

  function centreOn(personId, animated = true, s = 1) {
    const p = layoutRef.current.pos[personId];
    if (!p) return;
    moveTo(
      {
        s,
        tx: viewport.w / 2 - (p.x + NODE_W / 2) * s,
        // a little above the middle, so the info card at the bottom doesn't cover them
        ty: viewport.h * 0.42 - (p.y + NODE_H / 2) * s,
      },
      animated
    );
  }

  // Readable first view: the whole drawing if it fits at a sensible size,
  // otherwise zoomed in on the main person.
  function showStart(animated) {
    const { width, height } = layoutRef.current;
    const fitScale = Math.min(viewport.w / width, viewport.h / height, 1);
    if (fitScale >= 0.7) fitAll(animated);
    else centreOn(mode === 'family' ? centre : selfPersonId || centre, animated, 0.85);
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

  // When something opens or closes, everything shifts — keep the person whose
  // button was tapped in the same place on screen so the tree doesn't jump.
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

  function holdStill(personId) {
    stopGlide();
    const at = layout.pos[personId];
    anchor.current = at ? { id: personId, x: at.x, y: at.y } : null;
  }

  // First view, and a fresh view whenever the mode or the centre person changes
  const shownFor = useRef(null);
  useEffect(() => {
    if (loading || !viewportReady || !centre) return;
    const key = `${mode}|${centre}`;
    if (shownFor.current === key) return;
    const firstTime = shownFor.current === null;
    shownFor.current = key;
    showStart(!firstTime);
  }, [loading, viewportReady, mode, centre]);

  function toggleSide(personId) {
    holdStill(personId);
    setOpenIds((old) => {
      const next = new Set(old);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function toggleBranch(toggle) {
    holdStill(toggle.anchorId);
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(toggle.key)) next.delete(toggle.key);
      else next.add(toggle.key);
      return next;
    });
  }

  function showFamilyOf(personId) {
    setMode('family');
    setCentreId(personId);
    setOpenIds(new Set());
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

  // someone folded away or outside the current view can't stay selected
  const selected = selectedId && layout.pos[selectedId] ? graph.byId.get(selectedId) : null;
  const selectedRelation = selected ? describeRelation(graph, selfPersonId, selected.id) : null;

  // "▲ Dad's side" buttons and "Hide" buttons, in drawing coordinates
  const centreParents = centre ? graph.parentsOf(centre) : [];
  const handles = (view$?.handles || [])
    .filter((h) => layout.pos[h.personId])
    .map((h) => {
      const p = graph.byId.get(h.personId);
      const at = layout.pos[h.personId];
      let label = `${firstName(p)}'s side`;
      if (centreParents.includes(h.personId)) {
        if (p.gender === 'M') label = "Dad's side";
        else if (p.gender === 'F') label = "Mum's side";
      } else if (graph.spousesOf(centre).includes(h.personId)) {
        label = `${firstName(p)}'s family`;
      }
      return { ...h, label, x: at.x + NODE_W / 2 - HANDLE_W / 2, y: at.y - HANDLE_H - 6 };
    });
  const closers = (view$?.closers || [])
    .map((c) => {
      const parents = graph.parentsOf(c.personId).filter((pid) => layout.pos[pid]);
      if (!parents.length) return null;
      const x = parents.reduce((sum, pid) => sum + layout.pos[pid].x + NODE_W / 2, 0) / parents.length;
      return { personId: c.personId, x: x - CLOSER_W / 2, y: layout.pos[parents[0]].y + NODE_H + 8 };
    })
    .filter(Boolean);

  const controls = [
    { key: 'in', icon: 'add', label: 'Zoom in', onPress: () => zoomBy(1.4) },
    { key: 'out', icon: 'remove', label: 'Zoom out', onPress: () => zoomBy(1 / 1.4) },
    { key: 'fit', icon: 'scan-outline', label: 'Fit everything on screen', onPress: () => fitAll() },
    // each icon shows what tapping will switch TO
    {
      key: 'photos',
      icon: showPhotos ? 'text-outline' : 'image-outline',
      label: showPhotos ? 'Show names' : 'Show pictures',
      onPress: togglePhotos,
    },
    {
      key: 'mode',
      icon: mode === 'family' ? 'people-outline' : 'person-outline',
      label: mode === 'family' ? 'Show the whole family' : 'Show just my family',
      onPress: () => setMode(mode === 'family' ? 'everyone' : 'family'),
    },
  ];
  if (selfPersonId) {
    controls.push({
      key: 'me',
      icon: 'locate-outline',
      label: 'Find me',
      onPress: () => {
        setSelectedId(selfPersonId);
        if (mode === 'family' && centre !== selfPersonId) showFamilyOf(selfPersonId);
        else centreOn(selfPersonId);
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
            const isCentre = mode === 'family' && node.id === centre && !isSelf;
            const placeholder = isPlaceholder(p);
            const photo = photos[node.id];
            const years = yearsText(p);
            return (
              <Pressable
                key={node.id}
                style={[
                  styles.node,
                  { left: node.x, top: node.y },
                  p.is_deceased && styles.nodeDeceased,
                  placeholder && styles.nodePlaceholder,
                  isCentre && styles.nodeCentre,
                  isSelf && styles.nodeSelf,
                  isSelected && styles.nodeSelected,
                ]}
                onPress={() => setSelectedId(node.id)}
                accessibilityRole="button"
                accessibilityLabel={personLabel(p)}
              >
                {placeholder ? (
                  <Text allowFontScaling={false} style={styles.placeholderText}>
                    Unknown parent
                  </Text>
                ) : showPhotos && photo ? (
                  <Avatar uri={photo} size={PHOTO_SIZE} />
                ) : (
                  <>
                    <Avatar name={personLabel(p)} size={30} uri={photo} />
                    <Text allowFontScaling={false} numberOfLines={2} style={styles.nodeName}>
                      {personLabel(p)}
                    </Text>
                    {years ? (
                      <Text allowFontScaling={false} numberOfLines={1} style={[styles.nodeYears, p.is_deceased && styles.nodeYearsMemory]}>
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

          {/* "everyone" view: fold buttons under each couple */}
          {mode === 'everyone'
            ? layout.toggles.map((t) => (
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
              ))
            : null}

          {/* "my family" view: open a side upwards, or hide it again */}
          {handles.map((h) => (
            <Pressable
              key={`open-${h.personId}`}
              style={({ pressed }) => [styles.handle, { left: h.x, top: h.y }, pressed && styles.pressed]}
              onPress={() => toggleSide(h.personId)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Show ${h.label}`}
            >
              <Ionicons name="caret-up" size={12} color={colors.textOnPrimary} />
              <Text allowFontScaling={false} numberOfLines={1} style={styles.handleText}>
                {h.label}
              </Text>
              <Text allowFontScaling={false} style={styles.handleCount}>{h.count}</Text>
            </Pressable>
          ))}
          {closers.map((c) => (
            <Pressable
              key={`close-${c.personId}`}
              style={({ pressed }) => [styles.closer, { left: c.x, top: c.y }, pressed && styles.pressed]}
              onPress={() => toggleSide(c.personId)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Hide this side of the family"
            >
              <Ionicons name="caret-down" size={12} color={colors.primary} />
              <Text allowFontScaling={false} style={styles.closerText}>Hide</Text>
            </Pressable>
          ))}
        </Animated.View>

        <View style={styles.toolbar}>
          {controls.map((c, i) => (
            <Pressable
              key={c.key}
              style={({ pressed }) => [styles.toolButton, i > 0 && styles.toolDivider, pressed && styles.pressed]}
              onPress={c.onPress}
              accessibilityRole="button"
              accessibilityLabel={c.label}
            >
              <Ionicons name={c.icon} size={22} color={colors.primary} />
            </Pressable>
          ))}
        </View>

        <View style={styles.modeTag} pointerEvents="none">
          <Text style={styles.modeTagText}>
            {mode === 'everyone'
              ? 'Whole family'
              : centre === selfPersonId
              ? 'Your family'
              : `${firstName(graph.byId.get(centre))}'s family`}
          </Text>
        </View>

        {!selected ? (
          <Text style={styles.hint} pointerEvents="none">
            {mode === 'family' && handles.length
              ? 'Tap ▲ above a parent to open their side'
              : 'Drag to move · pinch to zoom · tap a person'}
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
              title="Profile"
              icon="person-outline"
              compact
              style={{ flex: 1 }}
              onPress={() =>
                navigation.push('Person', { familyId, familyName, personId: selected.id, personName: personLabel(selected) })
              }
            />
            {mode === 'everyone' || selected.id !== centre ? (
              <AppButton
                title="Their family"
                icon="git-network-outline"
                variant="secondary"
                compact
                style={{ flex: 1 }}
                onPress={() => showFamilyOf(selected.id)}
              />
            ) : null}
            {graveIds.includes(selected.id) ? (
              <AppButton
                title="Grave"
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
    gap: 3,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  nodeDeceased: { backgroundColor: colors.surfaceAlt },
  nodePlaceholder: { backgroundColor: colors.background, borderStyle: 'dashed', elevation: 0, shadowOpacity: 0 },
  nodeCentre: { borderWidth: 2, borderColor: colors.primary },
  nodeSelf: { borderWidth: 2, borderColor: colors.accent, backgroundColor: '#FBF6EA' },
  nodeSelected: { borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  nodeName: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium, textAlign: 'center' },
  nodeYears: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center' },
  nodeYearsMemory: { fontStyle: 'italic' },
  placeholderText: { color: colors.textMuted, fontSize: fontSize.xs, fontStyle: 'italic', textAlign: 'center' },
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
  handle: {
    position: 'absolute',
    width: HANDLE_W,
    height: HANDLE_H,
    borderRadius: HANDLE_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  handleText: { flexShrink: 1, color: colors.textOnPrimary, fontSize: 12, fontWeight: fontWeight.medium },
  handleCount: { color: colors.primaryDark, backgroundColor: colors.accent, fontSize: 10, fontWeight: fontWeight.bold, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 5 },
  closer: {
    position: 'absolute',
    width: CLOSER_W,
    height: TOGGLE_SIZE,
    borderRadius: TOGGLE_SIZE / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  closerText: { color: colors.primary, fontSize: 12, fontWeight: fontWeight.medium },
  toolbar: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.floating,
  },
  toolButton: { width: touchTarget - 2, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  toolDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  modeTag: { position: 'absolute', top: spacing.sm, left: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.xs },
  modeTagText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: fontWeight.medium },
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
