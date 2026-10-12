import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { blurField, moveCursor, pasteText, submitField, typeKey, useKeyboard, type KeyField } from '@/lib/keyboard';
import { shouldCap } from '@/lib/keyboard-logic';
import { dark, font, light, type Palette } from '@/lib/theme';

const TOOL = 46;
const PAD = 8;
const VGAP = 8;
const NUM_ROW = 54;
const TXT_ROW = 46;

export function keyboardHeight(mode: KeyField['mode'], bottom: number) {
  const row = mode === 'text' ? TXT_ROW : NUM_ROW;
  return TOOL + PAD + row * 4 + VGAP * 3 + PAD + Math.max(bottom, 6);
}

function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

/**
 * Kakei's own keyboard, docked under the screen. It sits below the app in the layout instead of floating over it,
 * so the screen above simply gets shorter while it is open.
 */
export function KeyboardHost() {
  const { field, last } = useKeyboard();
  const pal = useColorScheme() === 'dark' ? dark : light;
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const cfg = field ?? last;
  const target = cfg ? keyboardHeight(cfg.mode, insets.bottom) : 0;
  const h = useSharedValue(0);

  useEffect(() => {
    h.value = withTiming(field ? target : 0, { duration: reduce ? 0 : 280, easing: Easing.bezier(0.32, 0.72, 0, 1) });
  }, [field, target, reduce, h]);

  // Back closes the keyboard first, and only then leaves the screen.
  useEffect(() => {
    if (!field) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      blurField();
      return true;
    });
    return () => sub.remove();
  }, [field]);

  const anim = useAnimatedStyle(() => ({ height: h.value }));
  if (!cfg) return null;

  return (
    <Animated.View
      style={[
        { overflow: 'hidden', backgroundColor: pal.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line, pointerEvents: field ? 'auto' : 'none' },
        anim,
      ]}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: target, paddingHorizontal: 6 }}>
        <Toolbar cfg={cfg} pal={pal} />
        <View style={{ flex: 1, gap: VGAP, paddingTop: PAD, paddingBottom: PAD + Math.max(insets.bottom, 6) }}>
          <Keys key={`${cfg.id}:${cfg.mode}`} cfg={cfg} pal={pal} />
        </View>
      </View>
    </Animated.View>
  );
}

function Toolbar({ cfg, pal }: { cfg: KeyField; pal: Palette }) {
  const paste = async () => {
    tick();
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text) pasteText(text);
  };
  return (
    <View style={{ height: TOOL, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 }}>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.medium, fontSize: 11.5, letterSpacing: 1, color: pal.mut, textTransform: 'uppercase' }}>
        {cfg.label ?? ''}
      </Text>
      <Arrow dir={-1} pal={pal} />
      <Arrow dir={1} pal={pal} />
      {cfg.mode !== 'decimal' ? (
        <Pressable
          onPress={paste}
          accessibilityLabel="Paste"
          style={({ pressed }) => ({ height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: pal.line, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <MaterialCommunityIcons name="content-paste" size={15} color={pal.fg} />
          <Text style={{ fontFamily: font.medium, fontSize: 13, color: pal.fg }}>Paste</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          tick();
          blurField();
        }}
        accessibilityLabel="Done"
        style={({ pressed }) => ({ height: 32, paddingHorizontal: 16, borderRadius: 16, backgroundColor: pal.acc, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <Text style={{ fontFamily: font.semi, fontSize: 13, color: pal.accFg }}>Done</Text>
      </Pressable>
    </View>
  );
}

// Moves the caret one letter. Hold it to keep going.
function Arrow({ dir, pal }: { dir: -1 | 1; pal: Palette }) {
  const wait = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (wait.current) clearTimeout(wait.current);
    if (loop.current) clearInterval(loop.current);
    wait.current = null;
    loop.current = null;
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      accessibilityLabel={dir < 0 ? 'Move left' : 'Move right'}
      onPressIn={() => {
        tick();
        moveCursor(dir);
        stop();
        wait.current = setTimeout(() => {
          loop.current = setInterval(() => moveCursor(dir), 55);
        }, 350);
      }}
      onPressOut={stop}
      style={({ pressed }) => ({ width: 36, height: 32, borderRadius: 16, borderWidth: 1, borderColor: pal.line, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? pal.line : 'transparent' })}
    >
      <MaterialCommunityIcons name={dir < 0 ? 'chevron-left' : 'chevron-right'} size={22} color={pal.fg} />
    </Pressable>
  );
}

function Keys({ cfg, pal }: { cfg: KeyField; pal: Palette }) {
  const { value, cursor } = useKeyboard();
  // Capitals depend on what is before the caret, not on the end of the text.
  const before = Array.from(value).slice(0, cursor).join('');
  return cfg.mode === 'text' ? <Qwerty cfg={cfg} before={before} pal={pal} /> : <NumPad cfg={cfg} pal={pal} />;
}

function NumPad({ cfg, pal }: { cfg: KeyField; pal: Palette }) {
  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [cfg.mode === 'decimal' ? '.' : '', '0', 'del']];
  return (
    <>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, height: NUM_ROW }}>
          {row.map((k, j) =>
            k === '' ? (
              <View key={j} style={{ flex: 1 }} />
            ) : (
              <Key key={k} pal={pal} big tone={k === 'del' ? 'fn' : 'key'} icon={k === 'del' ? 'backspace-outline' : undefined} label={k === 'del' ? undefined : k} repeat={k === 'del'} onKey={() => typeKey(k)} />
            ),
          )}
        </View>
      ))}
    </>
  );
}

const LETTERS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const SYMBOLS = ['1234567890', '-/:;()₹&@"', ".,?!'_#%+"];

function Qwerty({ cfg, before, pal }: { cfg: KeyField; before: string; pal: Palette }) {
  const [layer, setLayer] = useState<'abc' | 'sym'>('abc');
  const [shift, setShift] = useState<'off' | 'once' | 'lock'>('off');
  const lastShift = useRef(0);
  const up = shift !== 'off' || shouldCap(cfg.caps, before);
  const rows = layer === 'abc' ? LETTERS : SYMBOLS;

  const press = (ch: string) => {
    typeKey(layer === 'abc' && up ? ch.toUpperCase() : ch);
    if (shift === 'once') setShift('off');
  };
  const onShift = () => {
    const now = Date.now();
    if (now - lastShift.current < 350) setShift('lock');
    else setShift((s) => (s === 'off' ? 'once' : 'off'));
    lastShift.current = now;
  };

  const r3 = Array.from(rows[2]);
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 5, height: TXT_ROW }}>
        {Array.from(rows[0]).map((ch) => (
          <Key key={ch} pal={pal} label={layer === 'abc' && up ? ch.toUpperCase() : ch} onKey={() => press(ch)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 5, height: TXT_ROW, paddingHorizontal: layer === 'abc' ? '5%' : 0 }}>
        {Array.from(rows[1]).map((ch) => (
          <Key key={ch} pal={pal} label={layer === 'abc' && up ? ch.toUpperCase() : ch} onKey={() => press(ch)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 5, height: TXT_ROW }}>
        {layer === 'abc' ? (
          <Key
            pal={pal}
            flex={1.5}
            tone={up ? 'primary' : 'fn'}
            icon={shift === 'lock' ? 'arrow-up-bold-box' : up ? 'arrow-up-bold' : 'arrow-up-bold-outline'}
            label="Shift"
            onKey={onShift}
          />
        ) : null}
        {r3.map((ch) => (
          <Key key={ch} pal={pal} label={layer === 'abc' && up ? ch.toUpperCase() : ch} onKey={() => press(ch)} />
        ))}
        <Key pal={pal} flex={1.5} tone="fn" icon="backspace-outline" label="Delete" repeat onKey={() => typeKey('del')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 5, height: TXT_ROW }}>
        <Key pal={pal} flex={1.5} tone="fn" label={layer === 'abc' ? '123' : 'ABC'} small onKey={() => setLayer((l) => (l === 'abc' ? 'sym' : 'abc'))} />
        <Key pal={pal} flex={5} label="space" small onKey={() => typeKey(' ')} />
        <Key pal={pal} flex={1} label="." onKey={() => typeKey('.')} />
        <Key
          pal={pal}
          flex={1.7}
          tone="primary"
          icon={cfg.multiline ? 'keyboard-return' : 'check'}
          label={cfg.multiline ? 'Return' : 'Done'}
          onKey={() => (cfg.multiline ? typeKey('enter') : submitField())}
        />
      </View>
    </>
  );
}

type KeyProps = {
  pal: Palette;
  label?: string;
  icon?: string;
  flex?: number;
  tone?: 'key' | 'fn' | 'primary';
  big?: boolean;
  small?: boolean;
  repeat?: boolean;
  onKey: () => void;
};

// Keys fire on touch-down so fast typing keeps up, and hold-to-repeat covers delete.
function Key({ pal, label, icon, flex = 1, tone = 'key', big, small, repeat, onKey }: KeyProps) {
  const fired = useRef(false);
  const wait = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef(onKey);
  useEffect(() => {
    latest.current = onKey;
  });

  const stop = () => {
    if (wait.current) clearTimeout(wait.current);
    if (loop.current) clearInterval(loop.current);
    wait.current = null;
    loop.current = null;
  };
  useEffect(() => stop, []);

  const fire = () => {
    tick();
    latest.current();
  };
  const bg = tone === 'primary' ? pal.acc : tone === 'fn' ? pal.bar : pal.sub;
  const fg = tone === 'primary' ? pal.accFg : pal.fg;

  return (
    <Pressable
      accessibilityLabel={label}
      onPressIn={() => {
        fired.current = true;
        fire();
        if (repeat) {
          stop();
          wait.current = setTimeout(() => {
            loop.current = setInterval(() => latest.current(), 65);
          }, 380);
        }
      }}
      onPressOut={stop}
      onPress={() => {
        // Screen readers activate without a touch-down, so they still get the key.
        if (!fired.current) fire();
        fired.current = false;
      }}
      style={({ pressed }) => ({
        flex,
        borderRadius: big ? 16 : 11,
        backgroundColor: pressed ? (tone === 'primary' ? pal.fg : pal.line) : bg,
        borderWidth: tone === 'key' ? StyleSheet.hairlineWidth : 0,
        borderColor: pal.line,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}
    >
      {icon ? (
        <MaterialCommunityIcons name={icon as never} size={big ? 24 : 21} color={fg} />
      ) : (
        <Text style={{ fontFamily: big ? font.displaySm : font.medium, fontSize: big ? 26 : small ? 14 : 20, color: fg }}>{label}</Text>
      )}
    </Pressable>
  );
}
