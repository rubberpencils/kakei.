import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useRef } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View, type GestureResponderEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import {
  blurField,
  focusField,
  registerField,
  setCursor,
  syncValue,
  unregisterField,
  useKeyboard,
  type Caps,
  type KeyMode,
} from '@/lib/keyboard';
import { dark, font, light } from '@/lib/theme';

export type InputProps = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  /** Which keys to show. Money fields use `decimal`, whole numbers `number`, phone numbers `phone`. */
  mode?: KeyMode;
  /** Capitals the way the field wants them. Names: `words`. Codes: `chars`. Addresses and search: `none`. */
  caps?: Caps;
  /** A short name shown above the keys, such as "Amount" or "Group name". */
  label?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  editable?: boolean;
  onSubmitEditing?: () => void;
  /** Keep the keyboard open after the return key, for fields that add several things in a row. */
  keepFocus?: boolean;
  onBlur?: () => void;
  style?: StyleProp<TextStyle>;
};

const TEXT_KEYS = new Set(['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'textAlign', 'letterSpacing', 'lineHeight', 'textTransform']);

function split(style: TextStyle) {
  const text: Record<string, unknown> = {};
  const box: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) (TEXT_KEYS.has(k) ? text : box)[k] = v;
  return { text: text as TextStyle, box: box as ViewStyle };
}

/**
 * A text field that types with Kakei's own keyboard instead of the system one. It draws the text and a caret itself,
 * so it looks the same on every phone. Tap to put the caret between letters, or use the arrow keys above the keyboard.
 */
export function Input(props: InputProps) {
  const {
    value, placeholder, placeholderTextColor, mode = 'text', caps = 'sentences', label, multiline,
    secureTextEntry, maxLength, autoFocus, editable = true, keepFocus, style,
  } = props;
  const id = useId();
  const pal = useColorScheme() === 'dark' ? dark : light;
  const { field, cursor } = useKeyboard();
  const focused = field?.id === id;
  const was = useRef(false);
  const latest = useRef(props);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    registerField(id, { onChange: (v) => latest.current.onChangeText(v), onSubmit: () => latest.current.onSubmitEditing?.() });
    return () => unregisterField(id);
  }, [id]);

  useEffect(() => {
    syncValue(id, value);
  }, [id, value]);

  useEffect(() => {
    if (was.current && !focused) latest.current.onBlur?.();
    was.current = focused;
  }, [focused]);

  // Leaving the screen closes the keyboard, so it never hangs around over a screen with nothing to type into.
  useFocusEffect(useCallback(() => () => blurField(id), [id]));

  const open = useCallback((cursor?: number) => {
    if (!editable) return;
    focusField({ id, mode, caps, label: label ?? placeholder, multiline, maxLength }, value, keepFocus, cursor);
  }, [editable, id, mode, caps, label, placeholder, multiline, maxLength, value, keepFocus]);

  const rowRef = useRef<View>(null);
  // A tap puts the caret between the letters nearest the finger. Letters are not all the same width, so on a long line
  // this lands within a letter or two, and the arrow keys finish the job.
  const press = (e: GestureResponderEvent) => {
    if (!editable) return;
    const count = Array.from(value).length;
    const place = (at: number) => (focused ? setCursor(at) : open(at));
    if (!count || multiline || !rowRef.current) return focused ? undefined : open();
    const pageX = e.nativeEvent.pageX;
    rowRef.current.measureInWindow((x, _y, w) => {
      const f = w > 0 ? (pageX - x) / w : 1;
      place(Math.round(Math.max(0, Math.min(1, f)) * count));
    });
  };

  useEffect(() => {
    if (autoFocus && editable) {
      const t = setTimeout(open, 60);
      return () => clearTimeout(t);
    }
    // Only once, when the field first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flat = StyleSheet.flatten(style) ?? {};
  const { text, box } = split(flat);
  const size = Number(text.fontSize ?? 16);
  const align = text.textAlign;
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  const shown = secureTextEntry ? '•'.repeat(Array.from(value).length) : value;
  // The text either side of the caret. A space next to the caret becomes a no-break space so it keeps its width.
  const glyphs = Array.from(shown);
  const at = focused ? Math.min(cursor, glyphs.length) : glyphs.length;
  const solid = (s: string) => s.replace(/^ +| +$/g, (m) => '\u00A0'.repeat(m.length));
  const before = solid(glyphs.slice(0, at).join(''));
  const after = solid(glyphs.slice(at).join(''));
  const textColor = text.color ?? pal.fg;
  const hint = placeholderTextColor ?? pal.mut;

  // A focused field lights its line in the brand colour, unless it is already showing an error.
  const ring: ViewStyle = {};
  if (focused && box.borderColor !== pal.neg) {
    if (box.borderBottomWidth) ring.borderBottomColor = pal.brand;
    if (box.borderWidth) ring.borderColor = pal.brand;
  }

  return (
    <Pressable
      accessibilityLabel={label ?? placeholder}
      onPress={press}
      style={[{ minHeight: Math.ceil(size * 1.45), justifyContent: 'center' }, box, ring, !editable && { opacity: 0.6 }]}
    >
      {multiline ? (
        <Text style={[text, { textAlign: align ?? 'left' }]}>
          {shown ? before : <Text style={{ color: hint }}>{placeholder}</Text>}
          {focused ? <Text style={{ color: pal.brand }}>|</Text> : null}
          {after}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: justify }}>
          <View ref={rowRef} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
            {focused && !value ? <Caret height={Math.ceil(size * 1.15)} color={pal.brand} activity={`${glyphs.length}:${cursor}`} /> : null}
            {value ? (
              <>
                {before ? <Text numberOfLines={1} ellipsizeMode="head" style={[text, { flexShrink: 1, color: textColor }]}>{before}</Text> : null}
                {focused ? <Caret height={Math.ceil(size * 1.15)} color={pal.brand} activity={`${glyphs.length}:${cursor}`} /> : null}
                {after ? <Text numberOfLines={1} style={[text, { flexShrink: 1, color: textColor }]}>{after}</Text> : null}
              </>
            ) : (
              <Text numberOfLines={1} style={[text, { flexShrink: 1, color: hint, fontFamily: text.fontFamily ?? font.body }]}>{placeholder ?? ''}</Text>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

// `activity` changes on every keystroke or caret move. The caret stops blinking while you type, and gives a small
// springy stretch so each letter has a felt landing.
function Caret({ height, color, activity }: { height: number; color: string; activity: string }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    cancelAnimation(o);
    o.value = 1;
    o.value = withDelay(520, withRepeat(withSequence(withTiming(0, { duration: 90 }), withDelay(520, withTiming(1, { duration: 90 })), withDelay(520, withTiming(1, { duration: 0 }))), -1));
    return () => cancelAnimation(o);
  }, [reduce, o, activity]);
  useEffect(() => {
    if (reduce) return;
    s.value = 0.72;
    s.value = withSpring(1, { duration: 220, dampingRatio: 0.7 });
  }, [reduce, s, activity]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scaleY: s.value }] }));
  return <Animated.View style={[{ width: 2, height, borderRadius: 1, backgroundColor: color, marginHorizontal: 1 }, anim]} />;
}
