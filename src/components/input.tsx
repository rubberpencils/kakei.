import { useColorScheme, TextInput, type StyleProp, type TextStyle } from 'react-native';

import { sanitize, type InputMode } from '@/lib/input-rules';
import { dark, font, light } from '@/lib/theme';

export type { InputMode } from '@/lib/input-rules';
export type Caps = 'none' | 'words' | 'sentences' | 'chars';

export type InputProps = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  /** Which keys to show. Money fields use `decimal`, whole numbers `number`, phone numbers `phone`. */
  mode?: InputMode;
  /** Capitals the way the field wants them. Names: `words`. Codes: `chars`. Addresses and search: `none`. */
  caps?: Caps;
  /** A short name for screen readers. */
  label?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  editable?: boolean;
  onSubmitEditing?: () => void;
  /** Keep the keyboard open after the return key, for fields that add several things in a row. */
  keepFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<TextStyle>;
};

const KEYBOARD = { text: 'default', decimal: 'decimal-pad', number: 'number-pad', phone: 'phone-pad', url: 'url' } as const;
const CAPS = { none: 'none', words: 'words', sentences: 'sentences', chars: 'characters' } as const;

/**
 * A text field that uses the phone's own keyboard. Amounts, whole numbers and phone numbers are cleaned as they are
 * typed or pasted, so a field never holds something it cannot use.
 */
export function Input({
  value, onChangeText, placeholder, placeholderTextColor, mode = 'text', caps = 'sentences', label, multiline,
  secureTextEntry, maxLength, autoFocus, editable = true, onSubmitEditing, keepFocus, onFocus, onBlur, style,
}: InputProps) {
  const pal = useColorScheme() === 'dark' ? dark : light;
  return (
    <TextInput
      value={value}
      onChangeText={(v) => onChangeText(sanitize(mode, v, maxLength))}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor ?? pal.mut}
      accessibilityLabel={label ?? placeholder}
      keyboardType={KEYBOARD[mode]}
      autoCapitalize={mode === 'text' ? CAPS[caps] : 'none'}
      autoCorrect={mode === 'text' && caps !== 'none'}
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      maxLength={maxLength}
      autoFocus={autoFocus}
      editable={editable}
      onSubmitEditing={onSubmitEditing}
      submitBehavior={multiline ? 'newline' : keepFocus ? 'submit' : 'blurAndSubmit'}
      onFocus={onFocus}
      onBlur={onBlur}
      selectionColor={pal.brand}
      cursorColor={pal.brand}
      style={[{ fontFamily: font.body, color: pal.fg, padding: 0 }, !editable && { opacity: 0.6 }, style, multiline && { textAlignVertical: 'top' }]}
    />
  );
}
