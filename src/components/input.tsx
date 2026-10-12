import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useRef } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import {
  blurField,
  focusField,
  registerField,
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
 * so it looks the same on every phone. Typing always happens at the end of the text.
 */
export function Input(props: InputProps) {
  const {
    value, placeholder, placeholderTextColor, mode = 'text', caps = 'sentences', label, multiline,
    secureTextEntry, maxLength, autoFocus, editable = true, keepFocus, style,
  } = props;
  const id = useId();
  const pal = useColorScheme() === 'dark' ? dark : light;
  const { field } = useKeyboard();
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

  const open = useCallback(() => {
    if (!editable) return;
    focusField({ id, mode, caps, label: label ?? placeholder, multiline, maxLength }, value, keepFocus);
  }, [editable, id, mode, caps, label, placeholder, multiline, maxLength, value, keepFocus]);

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
      onPress={open}
      style={[{ minHeight: Math.ceil(size * 1.45), justifyContent: 'center' }, box, ring, !editable && { opacity: 0.6 }]}
    >
      {multiline ? (
        <Text style={[text, { textAlign: align ?? 'left' }]}>
          {shown ? shown : <Text style={{ color: hint }}>{placeholder}</Text>}
          {focused ? <Text style={{ color: pal.brand }}>|</Text> : null}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: justify }}>
          {focused && !value ? <Caret height={Math.ceil(size * 1.15)} color={pal.brand} /> : null}
          {value ? (
            <Text numberOfLines={1} ellipsizeMode="head" style={[text, { flexShrink: 1, color: textColor }]}>{shown}</Text>
          ) : (
            <Text numberOfLines={1} style={[text, { flexShrink: 1, color: hint, fontFamily: text.fontFamily ?? font.body }]}>{placeholder ?? ''}</Text>
          )}
          {focused && value ? <Caret height={Math.ceil(size * 1.15)} color={pal.brand} /> : null}
        </View>
      )}
    </Pressable>
  );
}

function Caret({ height, color }: { height: number; color: string }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withSequence(withDelay(520, withTiming(0, { duration: 90 })), withDelay(520, withTiming(1, { duration: 90 }))), -1);
    return () => cancelAnimation(o);
  }, [reduce, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 2, height, borderRadius: 1, backgroundColor: color, marginHorizontal: 1 }, anim]} />;
}
