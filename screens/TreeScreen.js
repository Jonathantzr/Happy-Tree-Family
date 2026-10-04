import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, Animated, PanResponder, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import { buildGraph, describeRelation, relationText, explainRelation } from '../lib/relationships';
import { layoutTree, familyView, everyoneView, NODE_W, NODE_H, TOGGLE_SIZE } from '../lib/treeLayout';
import { formatPersonMeta } from '../lib/personHelpers';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
const PHOTO_SIZE = 72;
const TAG_H = 24; // the small "▲ Family +6" / "▼ Hide" tag on the top edge of a person's box
const PATH_W = 6; // thickness of the gold "how we're related" line
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
// - "everyone": your whole family at once (blood relatives on both sides and who
//   they married), with fold buttons under each couple. A husband's/wife's own
//   family stays folded behind a "▲ …'s family" button on their box.
export default function TreeScreen({ route, navigation }) {
  const { familyId, familyName, focusPersonId } = route.params;

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [graveIds, setGraveIds] = useState([]); // person ids that have a grave record
  const [selfPersonId, setSelfPersonId] = useState(null);
  // up to two people can be selected (tap again to unselect); with two, the
  // card at the bottom offers to show how they're related
  const [selectedIds, setSelectedIds] = useState(focusPersonId ? [focusPersonId] : []);
  const [linkShown, setLinkShown] = useState(false); // "how are we related" opened on the card
  const [viewportReady, setViewportReady] = useState(false);
  const [photos, setPhotos] = useState({}); // person id -> their first biography photo
  const [showPhotos, setShowPhotos] = useState(false);  const [mode, setMode] = useState('family'); // 'family' | 'everyone'
  const [centreId, setCentreId] = useState(focusPersonId || null); // null = you
  const [openIds, setOpenIds] = useState(() => new Set()); // people whose parents' side is open
  const [collapsed, setCollapsed] = useState(() => new Set()); // folded branches in "everyone"
  const [showSteps, setShowSteps] = useState(false);
  const [freshView, setFreshView] = useState(0); // bumped to re-show the starting view

  // ---- turning the phone sideways ----
  // The tree is the one screen that works sideways (a wide row of brothers,
  // sisters and cousins fits much better). While it is open the phone may
  // rotate; leaving it puts the app upright again. The toolbar button turns
  // it for people who keep their phone's auto-rotate switched off.
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const landscape = window.width > window.height;

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.unlockAsync().catch(() => {});
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [])
  );

  function turnScreen() {
    const lock = landscape ? ScreenOrientation.OrientationLock.PORTRAIT_UP : ScreenOrientation.OrientationLock.LANDSCAPE;
    ScreenOrientation.lockAsync(lock).catch(() => {});
  }

  // Sideways there is little height, so the bottom tab bar steps aside.
  useFocusEffect(
    useCallback(() => {
      const tabs = navigation.getParent();
      const normal = { backgroundColor: colors.surface, borderTopColor: colors.border };
      tabs?.setOptions({ tabBarStyle: landscape ? { display: 'none' } : normal });
      return () => tabs?.setOptions({ tabBarStyle: normal });
    }, [navigation, landscape])
  );

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
    setPhotos(photoMap);    setSelfPersonId(me ? me.id : null);
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

  // whose family the "everyone" view is drawn around
  const everyoneAnchor = selfPersonId || centre;

  const view$ = useMemo(() => {
    if (!centre) return null;
    return mode === 'family' ? familyView(graph, centre, openIds) : everyoneView(graph, everyoneAnchor, openIds);
  }, [mode, graph, centre, everyoneAnchor, openIds]);

  const layout = useMemo(() => {
    if (!view$) return layoutTree(people, graph, collapsed, { anchorId: everyoneAnchor });
    const shown = people.filter((p) => view$.visible.has(p.id));
    return mode === 'family'
      ? layoutTree(shown, buildGraph(shown, relationships), NO_FOLDS, { anchorId: centre })
      : layoutTree(shown, buildGraph(shown, relationships), collapsed, { anchorId: everyoneAnchor });
  }, [view$, mode, people, graph, relationships, collapsed, everyoneAnchor, centre]);

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

  // First view, and a fresh view whenever the mode or the centre person
  // changes. It switches straight to the new view (no sliding across the
  // screen), so it feels like the tree simply changes.
  const shownFor = useRef(null);
  useLayoutEffect(() => {
    if (loading || !viewportReady || !centre) return;
    const key = `${mode}|${centre}|${freshView}`;
    if (shownFor.current === key) return;
    shownFor.current = key;
    showStart(false);
  }, [loading, viewportReady, mode, centre, freshView, layout]);

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
  const picked = selectedIds.filter((id) => layout.pos[id]).map((id) => graph.byId.get(id));
  const selected = picked.length === 1 ? picked[0] : null;
  const pair = picked.length === 2 ? picked : null;
  const selectedRelation = selected ? describeRelation(graph, selfPersonId, selected.id) : null;

  // In both views, each opened family of someone who married in gets its own colour — its lines,
  // its people's box edges and its "Hide family" button — so it can be followed
  // by eye. Colours follow the drawing, left to right (see below).
  // Colours are handed out left to right across the drawing, not in the order
  // of opening: that way two families drawn side by side never share a colour
  // (the same colour only comes round again six families along).
  const familyLeft = new Map(); // opener -> x of the leftmost box of the family they opened
  view$?.familyOf?.forEach((opener, id) => {
    const at = layout.pos[id];
    if (at) familyLeft.set(opener, Math.min(familyLeft.get(opener) ?? Infinity, at.x));
  });
  const openedFamilies = [...new Set(view$?.familyOf ? view$.familyOf.values() : [])].sort(
    (a, b) => (familyLeft.get(a) ?? Infinity) - (familyLeft.get(b) ?? Infinity)
  );
  const colourOfFamily = (openerId) => {
    const at = openedFamilies.indexOf(openerId);
    return at < 0 ? null : colors.familyLines[at % colors.familyLines.length];
  };
  const familyColour = (ids) => {
    const member = (ids || []).find((id) => view$?.familyOf?.has(id));
    return member ? colourOfFamily(view$.familyOf.get(member)) : null;
  };
  // coloured lines are drawn last so they sit on top where lines cross
  const drawnLines = layout.lines.map((l) => ({ ...l, colour: familyColour(l.ids) })).sort((a, b) => (a.colour ? 1 : 0) - (b.colour ? 1 : 0));

  // ---- the tags that open and hide a side of the family ----
  // ONE look in both views ("My family" and "Everyone"): a small tag sitting on
  // the top edge of the person's box — "▲ Dad's side +5", "▲ Family +6" —
  // which turns into "▼ Hide" once that side is open. It sits ON the box, never
  // above it: the space above a box belongs to the tree's lines, and a button
  // there hid them and made it unclear who the person is joined to.
  const centreParents = centre ? graph.parentsOf(centre) : [];
  const handles = [...(view$?.handles || []), ...(view$?.closers || []).map((c) => ({ personId: c.personId, open: true }))]
    .filter((h) => layout.pos[h.personId])
    .map((h) => {
      const p = graph.byId.get(h.personId);
      const at = layout.pos[h.personId];
      let label = 'Family'; // a husband's or wife's own family
      if (h.open) label = 'Hide';
      else if (mode === 'family' && centreParents.includes(h.personId)) {
        label = p.gender === 'M' ? "Dad's side" : p.gender === 'F' ? "Mum's side" : `${firstName(p)}'s side`;
      } else if (mode === 'family' && !graph.spousesOf(centre).includes(h.personId)) {
        label = `${firstName(p)}'s side`;
      }
      return { ...h, label, colour: h.open ? colourOfFamily(h.personId) : null, name: personLabel(p), x: at.x, y: at.y - TAG_H / 2 };
    });
  const taggedIds = new Set(handles.map((h) => h.personId));

  // "How are we related?" — one person selected: from you to them;
  // two selected: between the two (worded from you if you're one of them).
  let fromId = null;
  let toId = null;
  if (selected && selfPersonId && selected.id !== selfPersonId) {
    fromId = selfPersonId;
    toId = selected.id;
  } else if (pair) {
    [fromId, toId] = pair[1].id === selfPersonId ? [pair[1].id, pair[0].id] : [pair[0].id, pair[1].id];
  }
  const connection = linkShown && fromId ? explainRelation(graph, fromId, toId, fromId === selfPersonId) : null;
  const pathIds = new Set(connection?.people || []);

  // The gold highlight follows the tree's own lines: up from a child to the
  // bar under its parents, along it, and up to the one parent that matters
  // (not across to the other parent). Brothers/sisters are joined along the
  // bar under their parents, without climbing up to the parents at all.
  const pathRects = [];
  if (connection) {
    const P = PATH_W;
    const v = (x, y1, y2) => pathRects.push({ left: x - P / 2, top: Math.min(y1, y2), width: P, height: Math.abs(y2 - y1) });
    const h = (x1, x2, y) => pathRects.push({ left: Math.min(x1, x2) - P / 2, top: y - P / 2, width: Math.abs(x2 - x1) + P, height: P });
    const mid = (id) => layout.pos[id].x + NODE_W / 2;
    const linkTo = (child, parent) => (layout.childLinks[child] || []).find((l) => l.parents.includes(parent));
    const childToParent = (child, parent) => {
      const link = linkTo(child, parent);
      if (!link || !layout.pos[child] || !layout.pos[parent]) return;
      v(mid(child), layout.pos[child].y, link.busY);
      h(mid(child), link.fromX, link.busY);
      v(link.fromX, link.busY, link.fromY);
      if (link.parents.length > 1) {
        // from the middle of the couple's line to this parent's box only
        const at = layout.pos[parent];
        h(link.fromX, mid(parent) < link.fromX ? at.x + NODE_W : at.x, link.fromY);
      }
    };
    for (const hop of connection.hops) {
      if (hop.type === 'parent') childToParent(hop.from, hop.to);
      else if (hop.type === 'child') childToParent(hop.to, hop.from);
      else if (hop.type === 'spouse') {
        if (layout.pos[hop.from] && layout.pos[hop.to]) h(mid(hop.from), mid(hop.to), layout.pos[hop.from].y + NODE_H / 2);
      } else if (hop.type === 'sibling') {
        const a = hop.parents.map((p) => linkTo(hop.from, p)).find(Boolean);
        const b = hop.parents.map((p) => linkTo(hop.to, p)).find(Boolean);
        if (a && b && a.busY === b.busY && layout.pos[hop.from] && layout.pos[hop.to]) {
          v(mid(hop.from), layout.pos[hop.from].y, a.busY);
          h(mid(hop.from), mid(hop.to), a.busY);
          v(mid(hop.to), a.busY, layout.pos[hop.to].y);
        } else if (hop.parents[0]) {
          // drawn under different bars (e.g. half-brothers): go via the shared parent
          childToParent(hop.from, hop.parents[0]);
          childToParent(hop.to, hop.parents[0]);
        }
      }
    }
  }

  // Tap to select, tap again to unselect. A third person replaces the one
  // selected first, so the two most recent stay selected.
  function tapPerson(id) {
    setShowSteps(false);
    setLinkShown(false);
    setSelectedIds((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id].slice(-2)));
  }

  function clearSelection() {
    setSelectedIds([]);
    setLinkShown(false);
    setShowSteps(false);
  }

  const controls = [
    { key: 'fit', icon: 'scan-outline', label: 'Fit everything on screen', onPress: () => fitAll() },
    // shows what tapping will switch TO: a picture icon while names are showing, and back
    {
      key: 'photos',
      icon: showPhotos ? 'text-outline' : 'image-outline',
      label: showPhotos ? 'Show names' : 'Show pictures',
      onPress: togglePhotos,
    },
    {
      key: 'turn',
      icon: landscape ? 'phone-portrait-outline' : 'phone-landscape-outline',
      label: landscape ? 'Turn the tree upright' : 'Turn the tree sideways',
      onPress: turnScreen,
    },
  ];

  // Tapping "My family" or "Everyone" always starts that view fresh: every
  // opened side or folded branch goes back to how it was, and "My family"
  // goes back to you.
  function chooseMode(next) {
    setOpenIds(new Set());
    setCollapsed(new Set());
    if (next === 'family') setCentreId(null);
    setMode(next);
    setFreshView((n) => n + 1);
  }

  return (
    <Screen
      scroll={false}
      keyboardAvoiding={false}
      contentContainerStyle={[
        styles.screen,
        // sideways: the details card moves to the side, and the phone's own
        // buttons / camera cut-out can be on the left or right edge
        { paddingLeft: insets.left, paddingRight: insets.right },
        landscape && { flexDirection: 'row', paddingBottom: insets.bottom },
      ]}
    >
      <View ref={viewportRef} style={styles.viewport} onLayout={onViewportLayout} {...pan.panHandlers}>
        <Animated.View
          style={[
            styles.canvas,
            { width: layout.width, height: layout.height },
            { transform: [{ translateX: anim.x }, { translateY: anim.y }, { scale: anim.s }] },
          ]}
        >
          {drawnLines.map((l, i) => (
            <View key={i} style={[styles.line, { left: l.x, top: l.y, width: l.w, height: l.h }, l.colour && { backgroundColor: l.colour }]} />
          ))}

          {/* gold highlight along the tree's lines, between the two people being compared */}
          {pathRects.map((r, i) => (
            <View key={`path-${i}`} style={[styles.pathLine, r]} />
          ))}

          {layout.nodes.map((node) => {
            const p = graph.byId.get(node.id);
            const isSelected = selectedIds.includes(node.id);
            const isSelf = node.id === selfPersonId;
            const isCentre = mode === 'family' && node.id === centre && !isSelf;
            const placeholder = isPlaceholder(p);
            const photo = photos[node.id];
            const years = yearsText(p);
            const ownColour = familyColour([node.id]);
            return (
              <Pressable
                key={node.id}
                style={[
                  styles.node,
                  { left: node.x, top: node.y },
                  ownColour && { borderWidth: 2, borderColor: ownColour },
                  p.is_deceased && styles.nodeDeceased,
                  placeholder && styles.nodePlaceholder,
                  isCentre && styles.nodeCentre,
                  isSelf && styles.nodeSelf,
                  pathIds.has(node.id) && styles.nodeOnPath,
                  isSelected && styles.nodeSelected,
                ]}
                onPress={() => tapPerson(node.id)}
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
                  // moves to the bottom edge when a tag is using the top edge
                  <View style={[styles.youBadge, taggedIds.has(node.id) ? styles.youBadgeLow : styles.youBadgeHigh]}>
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

          {/* tags that open a side of the family, or hide it again — the same in both views */}
          {handles.map((h) => (
            <View key={`tag-${h.personId}`} pointerEvents="box-none" style={[styles.tagRow, { left: h.x, top: h.y }]}>
              <Pressable
                style={({ pressed }) => [styles.tag, h.colour && { borderWidth: 2, borderColor: h.colour }, pressed && styles.pressed]}
                onPress={() => toggleSide(h.personId)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={h.open ? `Hide ${h.name}'s family again` : `Show ${h.name}'s family`}
              >
                <Ionicons name={h.open ? 'caret-down' : 'caret-up'} size={10} color={h.colour || colors.primary} />
                <Text allowFontScaling={false} numberOfLines={1} style={[styles.tagText, h.colour && { color: h.colour }]}>
                  {h.label}
                </Text>
                {h.open ? null : (
                  <Text allowFontScaling={false} style={styles.tagCount}>
                    +{h.count}
                  </Text>
                )}
              </Pressable>
            </View>
          ))}
        </Animated.View>

        <View style={styles.toolbar}>
          {controls.map((c, i) => (
            <Pressable
              key={c.key}
              style={({ pressed }) => [styles.toolButton, i > 0 && styles.toolDivider, c.active && styles.toolButtonOn, pressed && styles.pressed]}
              onPress={c.onPress}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: !!c.active }}
            >
              <Ionicons name={c.icon} size={22} color={c.active ? colors.textOnPrimary : colors.primary} />
            </Pressable>
          ))}
        </View>

        {/* which view: just your family (opens side by side), or everyone at once */}
        <View style={styles.topLeft} pointerEvents="box-none">
          <View style={styles.segment}>
            {[
              { key: 'family', label: selfPersonId ? 'My family' : 'Family' },
              { key: 'everyone', label: 'Everyone' },
            ].map((s) => {
              const on = mode === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => chooseMode(s.key)}
                  style={[styles.segmentButton, on && styles.segmentButtonOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text allowFontScaling={false} style={on ? styles.segmentTextOn : styles.segmentText}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {mode === 'family' && selfPersonId && centre !== selfPersonId ? (
            <Pressable
              onPress={() => showFamilyOf(selfPersonId)}
              style={({ pressed }) => [styles.backChip, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-undo-outline" size={14} color={colors.primary} />
              <Text allowFontScaling={false} numberOfLines={1} style={styles.backChipText}>
                {firstName(graph.byId.get(centre))}'s family · back to mine
              </Text>
            </Pressable>
          ) : null}
        </View>

        {picked.length === 0 ? (
          <Text style={styles.hint} pointerEvents="none">
            {handles.some((h) => !h.open)
              ? 'Tap a ▲ tag to open that side of the family · tap two people to compare'
              : 'Tap a person for details · tap two people to compare'}
          </Text>
        ) : null}
      </View>

      {picked.length ? (
        <InfoCard landscape={landscape}>
          <View style={styles.infoTop}>
            {selected ? (
              <Avatar name={personLabel(selected)} size={44} uri={photos[selected.id]} />
            ) : (
              <View style={styles.pairAvatars}>
                <Avatar name={personLabel(pair[0])} size={36} uri={photos[pair[0].id]} />
                <View style={styles.pairSecond}>
                  <Avatar name={personLabel(pair[1])} size={36} uri={photos[pair[1].id]} />
                </View>
              </View>
            )}
            <View style={{ flex: 1 }}>
              {selected ? (
                <>
                  <Text style={styles.infoName}>{personLabel(selected)}</Text>
                  {selected.id === selfPersonId ? (
                    <Text style={styles.infoRelation}>This is you</Text>
                  ) : selectedRelation ? (
                    <Text style={styles.infoRelation}>{relationText(selectedRelation)}</Text>
                  ) : null}
                  {formatPersonMeta(selected) ? <Text style={styles.infoMeta}>{formatPersonMeta(selected)}</Text> : null}
                </>
              ) : (
                <>
                  <Text style={styles.infoName} numberOfLines={2}>
                    {personLabel(pair[0])} & {personLabel(pair[1])}
                  </Text>
                  {connection ? <Text style={styles.infoRelation}>{connection.summary}</Text> : null}
                </>
              )}
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              onPress={clearSelection}
              accessibilityRole="button"
              accessibilityLabel="Unselect"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* how the two are related — opened from here, shown in gold on the tree */}
          {fromId ? (
            !linkShown ? (
              pair ? (
                <AppButton title="How are they related?" icon="git-compare-outline" onPress={() => setLinkShown(true)} />
              ) : (
                <Pressable
                  onPress={() => setLinkShown(true)}
                  style={({ pressed }) => [styles.howLink, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="git-compare-outline" size={18} color={colors.primary} />
                  <Text style={styles.howToggleText}>How are we related?</Text>
                </Pressable>
              )
            ) : !connection ? (
              <Text style={styles.infoMeta}>No family link between them has been recorded yet.</Text>
            ) : (
              <View style={styles.howBox}>
                {connection.keyLink ? (
                  <Text style={styles.howKey}>{connection.keyLink}</Text>
                ) : connection.steps.length === 1 ? (
                  <Text style={styles.howKey}>{connection.steps[0]}.</Text>
                ) : null}
                {/* a single step needs no extra list */}
                {connection.steps.length > 1 ? (
                  <Pressable
                    onPress={() => setShowSteps(!showSteps)}
                    style={({ pressed }) => [styles.howToggle, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showSteps }}
                  >
                    <Text style={styles.howToggleText}>{showSteps ? 'Hide the steps' : `Show every step (${connection.steps.length})`}</Text>
                    <Ionicons name={showSteps ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
                  </Pressable>
                ) : null}
                {showSteps && connection.steps.length > 1
                  ? connection.steps.map((s, i) => (
                      <Text key={s} style={styles.howStep}>
                        {i + 1}. {s}
                      </Text>
                    ))
                  : null}
              </View>
            )
          ) : null}

          {selected ? (
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
          ) : null}
        </InfoCard>
      ) : null}
    </Screen>
  );
}

// Details of the selected person: along the bottom when upright, down the
// right-hand side (and scrollable) when the phone is sideways.
function InfoCard({ landscape, children }) {
  if (!landscape) return <View style={styles.infoCard}>{children}</View>;
  return (
    <ScrollView style={styles.infoCardSide} contentContainerStyle={styles.infoCardSideContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
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
  youBadgeHigh: { top: -9 },
  youBadgeLow: { bottom: -9 },
  youBadge: { position: 'absolute', right: 8, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
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
  tagRow: { position: 'absolute', width: NODE_W, height: TAG_H, alignItems: 'center', justifyContent: 'center' },
  tag: {
    maxWidth: NODE_W,
    height: TAG_H,
    borderRadius: TAG_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tagText: { flexShrink: 1, color: colors.primary, fontSize: 11, fontWeight: fontWeight.medium },
  tagCount: { color: colors.primaryDark, backgroundColor: colors.accent, fontSize: 10, fontWeight: fontWeight.bold, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 5 },
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
  toolButtonOn: { backgroundColor: colors.primary },
  topLeft: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: touchTarget + spacing.md, alignItems: 'flex-start', gap: spacing.xs },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, padding: 3, ...shadow.card },
  segmentButton: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentButtonOn: { backgroundColor: colors.primary },
  segmentText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  segmentTextOn: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  backChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', minHeight: 36, paddingHorizontal: spacing.sm + 4, borderRadius: radius.pill, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
  backChipText: { flexShrink: 1, color: colors.primary, fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  pathLine: { position: 'absolute', borderRadius: PATH_W / 2, backgroundColor: colors.accent },
  nodeOnPath: { borderWidth: 2, borderColor: colors.accent },
  howBox: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm + 4, gap: 4 },
  howKey: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  howToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  howLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40, alignSelf: 'flex-start' },
  pairAvatars: { flexDirection: 'row' },
  pairSecond: { marginLeft: -12, borderRadius: 20, borderWidth: 2, borderColor: colors.surface },
  howToggleText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  howStep: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  hint: { position: 'absolute', left: 0, right: 0, bottom: spacing.sm, textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs },
  infoCard: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  infoCardSide: { flexGrow: 0, width: 300, backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border },
  infoCardSideContent: { padding: spacing.md, gap: spacing.sm + 4 },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  infoName: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  infoRelation: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: 2 },
  infoMeta: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  closeButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  infoButtons: { flexDirection: 'row', gap: spacing.sm },
});
