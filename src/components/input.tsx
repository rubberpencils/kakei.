import { Platform, StyleSheet, TextInput, useColorScheme, type StyleProp, type TextStyle } from 'react-native';

import { cleanAmount, cleanNumber, cleanPhone } from '@/lib/input-rules';
import type { Caps, KeyMode } from '@/lib/keyboard';
import { dark, light } from '@/lib/theme';

export type InputProps = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  /** Which keys to show. Money fields use `decimal`, whole numbers `number`, phone numbers `phone`. */
  mode?: KeyMode;
  /** Capitals the way the field wants them. Names: `words`. Codes: `chars`. Addresses and search: `none`. */
  caps?: Caps;
  /** Kept so existing fields can still name themselves. The system keyboard has no caption row. */
  label?: string;
  /** Overrides `mode` when the field needs a system layout `mode` does not cover, such as a URL. */
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'decimal-pad' | 'url' | 'email-address';
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

/**
 * A normal system text field. The only custom keys in the app are the amount pad on the log screen.
 * A custom keyboard ate the Android back swipe and closed the app.
 */
export function Input({
  value, onChangeText, placeholder, placeholderTextColor, mode = 'text', caps = 'sentences',
  keyboardType, multiline, secureTextEntry, maxLength, autoFocus, editable = true,
  onSubmitEditing, keepFocus, onBlur, style,
}: InputProps) {
  const pal = useColorScheme() === 'dark' ? dark : light;
  const keys = keyboardType ?? (mode === 'decimal' ? 'decimal-pad' : mode === 'number' ? 'number-pad' : mode === 'phone' ? 'phone-pad' : 'default');
  const autoCapitalize = caps === 'words' ? 'words' : caps === 'chars' ? 'characters' : caps === 'none' ? 'none' : 'sentences';
  // Android paints the caret at the right edge of an empty centered field. A one-line multiline field centers it.
  const centerFix = Platform.OS === 'android' && !multiline && StyleSheet.flatten(style)?.textAlign === 'center';
  return (
    <TextInput
      value={value}
      onChangeText={(v) => {
        const next = mode === 'decimal' ? cleanAmount(v) : mode === 'number' ? cleanNumber(v) : mode === 'phone' ? cleanPhone(v) : v;
        onChangeText(centerFix ? next.replace(/\n/g, '') : next);
      }}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor ?? pal.mut}
      keyboardType={keys}
      autoCapitalize={multiline ? 'sentences' : autoCapitalize}
      autoCorrect={mode === 'text' && !secureTextEntry}
      multiline={multiline || centerFix}
      numberOfLines={centerFix ? 1 : undefined}
      scrollEnabled={centerFix ? false : undefined}
      textAlignVertical={centerFix ? 'center' : undefined}
      secureTextEntry={secureTextEntry}
      maxLength={maxLength}
      autoFocus={autoFocus}
      editable={editable}
      onSubmitEditing={onSubmitEditing}
      blurOnSubmit={multiline && !centerFix ? false : !keepFocus}
      onBlur={onBlur}
      style={[{ color: pal.fg, padding: 0, width: '100%' }, style, !editable && { opacity: 0.6 }]}
    />
  );
}
