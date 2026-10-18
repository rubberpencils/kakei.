import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';

import { Input } from '@/components/input';
import { dayKey, inr, monthName, prettyDay, slugTag } from '@/lib/format';
import { owedBack, pocket, remainingOwed, youStillOwe } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { dark, font, light, RAIL_ICON, RAIL_LABEL, tagColors } from '@/lib/theme';
import type { Expense, Settlement } from '@/lib/types';

export function usePalette() {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export function useDark() {
  return useColorScheme() === 'dark';
}

export function Icon({ name, size = 22, color }: { name: string; size?: number; color?: string }) {
  const c = usePalette();
  return <MaterialCommunityIcons name={name as never} size={size} color={color ?? c.fg} />;
}

export function Press({
  onPress, style, children, disabled,
}: {
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <Pressable
      role="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && !reduce && { transform: [{ scale: 0.98 }] }, disabled && { opacity: 0.4 }]}
    >
      {children}
    </Pressable>
  );
}

export function Screen({ children, pad = true, bottom = 24 }: { children: ReactNode; pad?: boolean; bottom?: number }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: bottom }}>
      <View style={{ flex: 1, paddingHorizontal: pad ? 24 : 0 }}>{children}</View>
    </View>
  );
}

export function Word({ children, size = 28, style }: { children: ReactNode; size?: number; style?: TextStyle }) {
  const c = usePalette();
  return (
    <Text style={[{ fontFamily: font.display, fontSize: size, letterSpacing: -0.8, color: c.fg }, style]}>
      {children}
    </Text>
  );
}

export function Section({ title, action, onAction, top = 32 }: { title: string; action?: string; onAction?: () => void; top?: number }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: top, marginBottom: 12 }}>
      <Text style={{ fontFamily: font.displaySm, fontSize: 17, letterSpacing: -0.2, color: c.fg }}>{title}</Text>
      {action && onAction ? (
        <Press onPress={onAction}>
          <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.mut }}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  const c = usePalette();
  return <Text style={{ fontFamily: font.display, fontSize: size, letterSpacing: -0.8, lineHeight: size + 4, color: c.brand }}>Kakei.</Text>;
}

export function avatarHue(id: string) {
  return [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 17);
}

export function Avatar({ id, label, size = 36, you }: { id: string; label: string; size?: number; you?: boolean }) {
  const c = usePalette();
  const isDark = useDark();
  const hue = avatarHue(id);
  const bg = you ? c.acc : isDark ? `hsl(${hue}, 18%, 20%)` : `hsl(${hue}, 32%, 90%)`;
  const fg = you ? c.accFg : isDark ? `hsl(${hue}, 30%, 78%)` : `hsl(${hue}, 30%, 30%)`;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.34, color: fg }}>{label}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = usePalette();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const seg = width ? (width - 6) / options.length : 0;
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const x = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (!seg) return;
    const to = idx * seg;
    x.value = reduce || !placed.current ? to : withSpring(to, { damping: 36, stiffness: 320 });
    placed.current = true;
  }, [idx, seg, reduce, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', backgroundColor: c.sub, borderRadius: 14, padding: 3 }}>
      {seg ? <Animated.View style={[{ position: 'absolute', top: 3, left: 3, bottom: 3, width: seg, borderRadius: 11, backgroundColor: c.bg, pointerEvents: 'none' }, thumb]} /> : null}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Press key={o.id} onPress={() => { if (!on) { buzz(); onChange(o.id); } }} style={{ flex: 1, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on && !seg ? c.bg : 'transparent' }}>
            <Text style={{ fontFamily: on ? font.semi : font.medium, fontSize: 13, color: on ? c.fg : c.mut }}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

export function Body({ children, style, color }: { children: ReactNode; style?: TextStyle; color?: string }) {
  const c = usePalette();
  return <Text style={[{ fontFamily: font.body, color: color ?? c.fg, fontSize: 15 }, style]}>{children}</Text>;
}

export function Button({ label, onPress, icon, disabled }: { label: string; onPress: () => void; icon?: string; disabled?: boolean }) {
  const c = usePalette();
  return (
    <Press onPress={onPress} disabled={disabled} style={[styles.btn, { backgroundColor: c.acc }]}>
      <Text style={[styles.btnText, { color: c.accFg, fontFamily: font.semi }]}>{label}</Text>
      {icon ? <Icon name={icon} size={20} color={c.accFg} /> : null}
    </Press>
  );
}

export function Ghost({ label, onPress }: { label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press onPress={onPress} style={styles.ghost}>
      <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.mut }}>{label}</Text>
    </Press>
  );
}

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function Back({ to }: { to?: () => void }) {
  const c = usePalette();
  return (
    <Press onPress={to ?? goBack} style={styles.hit}>
      <Icon name="arrow-left" size={24} color={c.fg} />
    </Press>
  );
}

export function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press onPress={() => { buzz(); onPress(); }} style={[styles.tog, { backgroundColor: on ? c.brand : c.bar }]}>
      <View style={[styles.knob, { backgroundColor: c.bg, transform: [{ translateX: on ? 18 : 0 }] }]} />
    </Press>
  );
}

export function TagPicker({
  value, onChange,
}: { value: string | null; onChange: (tag: string | null) => void }) {
  const c = usePalette();
  const isDark = useDark();
  const { tags, addTag } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = slugTag(q);
  const sugg = (query ? tags.filter((t) => t.includes(query)) : tags).slice(0, 8);
  const showCreate = !!query && !tags.includes(query);
  const pick = (tag: string) => {
    const saved = tags.includes(tag) ? tag : addTag(tag);
    if (!saved) return;
    onChange(saved);
    setQ('');
    setOpen(false);
  };
  if (!open) {
    if (value) {
      const col = tagColors(value, isDark);
      return (
        <View style={styles.tagRow}>
          <View style={[styles.chip, { backgroundColor: col.bg }]}>
            <Text style={{ color: col.fg, fontFamily: font.medium, fontSize: 14 }}>#{value}</Text>
            <Press onPress={() => onChange(null)}><Text style={{ color: col.fg, marginLeft: 6 }}>✕</Text></Press>
          </View>
        </View>
      );
    }
    return (
      <Press onPress={() => setOpen(true)} style={styles.tagRow}>
        <Icon name="plus" size={18} color={c.fg} />
        <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.fg }}>Add tag</Text>
      </Press>
    );
  }
  return (
    <View>
      <View style={[styles.search, { borderColor: c.line, backgroundColor: c.sub }]}>
        <Icon name="tag-outline" size={18} color={c.mut} />
        <Input
          value={q}
          onChangeText={setQ}
          placeholder="Search or create a tag"
          label="Tag"
          caps="none"
          autoFocus
          onSubmitEditing={() => query && pick(query)}
          style={[styles.input, { color: c.fg, fontFamily: font.body }]}
        />
        {!q ? <Icon name="plus" size={18} color={c.mut} /> : null}
      </View>
      {sugg.length > 0 || showCreate ? (
        <View style={[styles.menu, { borderColor: c.line }]}>
          {sugg.map((t) => {
            const col = tagColors(t, isDark);
            return (
              <Press key={t} onPress={() => pick(t)} style={[styles.menuRow, { borderBottomColor: c.faint }]}>
                <View style={[styles.dot, { backgroundColor: col.pie }]} />
                <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 14 }}>#{t}</Text>
              </Press>
            );
          })}
          {showCreate ? (
            <Press onPress={() => pick(query)} style={styles.menuRow}>
              <Icon name="plus" size={18} color={c.acc} />
              <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 14 }}>Create <Text style={{ color: c.acc }}>#{query}</Text></Text>
            </Press>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function SettleRow({ s, you, name, onPress }: { s: Settlement; you: string; name: (id: string) => string; onPress?: () => void }) {
  const c = usePalette();
  const mine = s.fromId === you || s.toId === you;
  const who = s.fromId === you ? `You paid ${name(s.toId)}` : s.toId === you ? `${name(s.fromId)} paid you` : `${name(s.fromId)} paid ${name(s.toId)}`;
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="cash-check" size={19} color={mine ? c.pos : c.mut} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.body, fontSize: 13.5, color: c.mut }} numberOfLines={1}>{who}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 11.5, color: c.mut, opacity: 0.75, marginTop: 1 }}>Marked as done</Text>
      </View>
      <Text style={{ fontFamily: font.medium, fontSize: 13.5, color: mine ? c.pos : c.mut }}>₹{inr(s.amount)}</Text>
    </Press>
  );
}

const FEED_ROW = 58;

function StickyDate({ at }: { at: string }) {
  const c = usePalette();
  const d = new Date(at);
  // The negative margin lays the date beside the day's first row; ScrollView moves the outer style onto its sticky wrapper.
  return (
    <View style={{ width: 30, height: FEED_ROW, marginBottom: -FEED_ROW, backgroundColor: c.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font.medium, fontSize: 10, color: c.mut, textTransform: 'uppercase' }}>{monthName(d.getMonth() + 1, true)}</Text>
        <Text style={{ fontFamily: font.displaySm, fontSize: 16, color: c.fg }}>{d.getDate()}</Text>
      </View>
    </View>
  );
}

function MonthLabel({ d }: { d: Date }) {
  const c = usePalette();
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  // Above the sticky dates (zIndex 10) so a new month slides over the previous month's pinned date.
  return <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.mut, paddingTop: 18, paddingBottom: 4, backgroundColor: c.bg, zIndex: 11 }}>{monthName(d.getMonth() + 1)}{year}</Text>;
}

/** Newest-first rows with each day's date shown once and sticky. Pass `nodes` as direct ScrollView children with no null siblings (native and web count those differently), and `sticky` shifted by the children before them as stickyHeaderIndices. */
export function timeline<T extends { at: string }>(events: T[], render: (ev: T) => ReactNode) {
  const nodes: ReactNode[] = [];
  const sticky: number[] = [];
  let month = '';
  let day = '';
  let rows: ReactNode[] = [];
  const flush = () => {
    if (rows.length) nodes.push(<View key={`rows-${day}`} style={{ paddingLeft: 42 }}>{rows}</View>);
    rows = [];
  };
  for (const ev of events) {
    const d = new Date(ev.at);
    const key = dayKey(ev.at);
    if (key !== day) {
      flush();
      if (key.slice(0, 7) !== month) nodes.push(<MonthLabel key={`month-${key}`} d={d} />);
      month = key.slice(0, 7);
      day = key;
      sticky.push(nodes.length);
      nodes.push(<StickyDate key={`date-${key}`} at={ev.at} />);
    }
    rows.push(render(ev));
  }
  flush();
  return { nodes, sticky };
}

export function TxnRow({ item, onRemove, showDay = true, full }: { item: Expense; onRemove?: () => void; showDay?: boolean; full?: boolean }) {
  const c = usePalette();
  const isDark = useDark();
  const store = useStore();
  const router = useRouter();
  const rem = remainingOwed(store.expenses, store.settlements);
  const you = store.you.id;
  const owed = owedBack(item, you, rem);
  const owe = youStillOwe(item, you, rem);
  const shown = item.groupId && !full ? pocket(item, you) : item.amount;
  const col = item.tag ? tagColors(item.tag, isDark) : null;
  const group = item.groupId ? store.groups.find((g) => g.id === item.groupId) : null;
  const row = (
    <Press onPress={() => router.push({ pathname: '/expense/[id]', params: { id: item.id } })} style={[styles.txn, { borderBottomColor: c.faint, backgroundColor: c.bg }]}>
      <View style={[styles.bubble, { backgroundColor: c.sub }]}>
        <Icon name={RAIL_ICON[item.rail] ?? 'cash'} size={18} color={c.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }} numberOfLines={1}>{item.merchant}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 2 }}>
          {showDay ? `${prettyDay(item.at)} · ` : ''}{RAIL_LABEL[item.rail]}
          {item.transfer ? ' · card bill' : ''}
          {item.recurring ? ` · ${item.recurring}` : ''}
          {group ? ` · ${group.name}` : ''}
          {group && !full && !item.income && shown !== item.amount ? ` · bill ₹${inr(item.amount)}` : ''}
        </Text>
        {owed > 0 ? <Text style={{ fontFamily: font.medium, fontSize: 12, color: c.pos, marginTop: 2 }}>Owed back ₹{inr(owed)}</Text> : null}
        {owe > 0 ? <Text style={{ fontFamily: font.medium, fontSize: 12, color: c.neg, marginTop: 2 }}>You owe ₹{inr(owe)}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontFamily: font.displaySm, fontSize: 16, color: item.income ? c.pos : c.fg }}>
          {item.income ? '+' : '−'}₹{inr(item.income || item.transfer ? item.amount : shown)}
        </Text>
        {col && item.tag ? (
          <View style={[styles.mini, { backgroundColor: col.bg }]}>
            <Text style={{ color: col.fg, fontSize: 11, fontFamily: font.medium }}>#{item.tag}</Text>
          </View>
        ) : null}
      </View>
    </Press>
  );
  if (!onRemove) return row;
  return (
    <Swipeable
      renderRightActions={() => (
        <Press onPress={() => { buzz(); onRemove(); }} style={[styles.del, { backgroundColor: c.neg }]}>
          <Text style={{ color: '#fff', fontFamily: font.semi }}>Remove</Text>
        </Press>
      )}
    >
      {row}
    </Swipeable>
  );
}

export function Toast() {
  const { toast } = useStore();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View style={[styles.toastWrap, { bottom: insets.bottom + 88, pointerEvents: 'none' }]}>
      <Animated.View key={toast} entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} style={[styles.toast, { backgroundColor: c.fg }]}>
        <Icon name="check" size={16} color={c.bg} />
        <Text style={{ color: c.bg, fontFamily: font.medium, fontSize: 13 }}>{toast}</Text>
      </Animated.View>
    </View>
  );
}

type Ask = {
  title: string;
  body?: string;
  confirm: string;
  destructive?: boolean;
  input?: { placeholder: string; secure?: boolean };
  /** Show the sheet in place. Used when a slide fights the thing the person just tapped. */
  still?: boolean;
  onConfirm: (value?: string) => void;
};
let showAsk: ((a: Ask) => void) | null = null;

export function ask(a: Ask) {
  showAsk?.(a);
}

export function ConfirmHost() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [a, setA] = useState<Ask | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  useEffect(() => {
    showAsk = (next) => {
      setValue('');
      setA(next);
      setOpen(true);
    };
    return () => {
      showAsk = null;
    };
  }, []);
  const close = (then?: () => void) => {
    const still = a?.still;
    setOpen(false);
    if (still) {
      setA(null);
      then?.();
      return;
    }
    setTimeout(() => {
      setA(null);
      then?.();
    }, reduce ? 120 : 200);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!a) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, [a]);
  const sheet = {
    backgroundColor: c.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: insets.bottom + 20,
  };
  if (!a) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 80, elevation: 80 }]}>
      {open ? (
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View entering={a.still ? undefined : FadeIn.duration(180)} exiting={a.still ? undefined : FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.45)' }]}>
            <Pressable style={{ flex: 1 }} onPress={() => close()} />
          </Animated.View>
          <Animated.View
            entering={a.still ? undefined : reduce ? FadeIn.duration(120) : SlideInDown.springify().damping(32).stiffness(320)}
            exiting={a.still ? undefined : reduce ? FadeOut.duration(120) : SlideOutDown.duration(200)}
            style={sheet}
          >
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.bar, marginBottom: 20 }} />
            <Text style={{ fontFamily: font.displaySm, fontSize: 20, color: c.fg }}>{a.title}</Text>
            {a.body ? <Text style={{ fontFamily: font.body, fontSize: 15, lineHeight: 22, color: c.mut, marginTop: 8 }}>{a.body}</Text> : null}
            {a.input ? (
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder={a.input.placeholder}
                placeholderTextColor={c.faint}
                secureTextEntry={a.input.secure}
                autoCapitalize="none"
                style={{ marginTop: 16, borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.body, fontSize: 16, color: c.fg }}
              />
            ) : null}
            <View style={{ marginTop: 24, gap: 4 }}>
              <Press
                onPress={() => { buzz(a.destructive ? 'tap' : 'done'); const typed = value; close(() => a.onConfirm(a.input ? typed : undefined)); }}
                style={[styles.btn, { backgroundColor: a.destructive ? c.neg : c.acc }]}
              >
                <Text style={[styles.btnText, { color: a.destructive ? '#fff' : c.accFg, fontFamily: font.semi }]}>{a.confirm}</Text>
              </Press>
              <Ghost label="Cancel" onPress={() => close()} />
            </View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

export function buzz(kind: 'tap' | 'done' = 'tap') {
  if (Platform.OS === 'web') return;
  if (kind === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.selectionAsync().catch(() => {});
}

export function Field({
  label, value, onChange, placeholder, secure, keyboard, auto = 'none', error, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboard?: 'default' | 'phone-pad' | 'number-pad' | 'url' | 'email-address';
  auto?: 'none' | 'words';
  error?: string | null;
  hint?: string;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.mut }}>{label}</Text>
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        label={label}
        secureTextEntry={secure}
        mode={keyboard === 'phone-pad' ? 'phone' : keyboard === 'number-pad' ? 'number' : 'text'}
        keyboardType={keyboard === 'url' ? 'url' : keyboard === 'email-address' ? 'email-address' : undefined}
        caps={auto === 'words' ? 'words' : 'none'}
        style={{ height: 52, borderRadius: 16, borderWidth: 1, borderColor: error ? c.neg : c.line, paddingHorizontal: 16, fontFamily: font.body, fontSize: 16, color: c.fg }}
      />
      {error ? <Text style={{ fontFamily: font.body, fontSize: 12, color: c.neg }}>{error}</Text> : null}
      {hint && !error ? <Text style={{ fontFamily: font.body, fontSize: 12, lineHeight: 17, color: c.mut }}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnText: { fontSize: 16 },
  ghost: { height: 48, alignItems: 'center', justifyContent: 'center' },
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tog: { width: 46, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  search: { height: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 14, padding: 0 },
  menu: { marginTop: 6, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 8, height: 8, borderRadius: 4 },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  bubble: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mini: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  del: { width: 88, alignItems: 'center', justifyContent: 'center' },
  toastWrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22 },
});
