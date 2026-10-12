import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { font } from '@/lib/theme';

const INK = '#0e0e10';
const PAPER = '#f7f7f5';
const PURPLE = '#704af8';

// "k." appears first. Then "akei" opens out from the k, sliding the dot to the end. The dot never bounces.
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduce = useReducedMotion();
  const out = useSharedValue(0);
  const open = useSharedValue(reduce ? 1 : 0);
  const rest = useSharedValue(0);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    if (!measured || reduce) return;
    open.value = withDelay(420, withTiming(1, { duration: 700, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
  }, [measured, reduce, open]);

  useEffect(() => {
    if (!ready) return;
    out.value = withDelay(reduce ? 150 : 1500, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }, (ok) => {
      if (ok) scheduleOnRN(onDone);
    }));
  }, [ready, reduce, out, onDone]);

  const wrap = useAnimatedStyle(() => ({ opacity: 1 - out.value }));
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: reduce ? 1 : 1 + out.value * 0.06 }] }));
  const clip = useAnimatedStyle(() => ({ width: rest.value * open.value, opacity: 0.25 + 0.75 * open.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { pointerEvents: 'none' }, wrap]}>
      {/* Invisible copy of "akei" so the opening knows how wide to grow. */}
      <Text
        style={[styles.word, styles.ghost]}
        onLayout={(e) => {
          rest.value = e.nativeEvent.layout.width;
          setMeasured(true);
        }}
      >
        akei
      </Text>
      <Animated.View style={[styles.row, mark]}>
        <Animated.View entering={reduce ? undefined : FadeIn.duration(360)}>
          <Text style={styles.word}>K</Text>
        </Animated.View>
        <Animated.View style={[styles.clip, clip]}>
          <Text style={[styles.word, styles.rest]} numberOfLines={1}>akei</Text>
        </Animated.View>
        <Animated.View entering={reduce ? undefined : FadeIn.duration(360)}>
          <Text style={[styles.word, { color: PURPLE }]}>.</Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: INK, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  clip: { overflow: 'hidden' },
  rest: { width: 400, flexShrink: 0 },
  ghost: { position: 'absolute', opacity: 0 },
  word: { fontFamily: font.display, fontSize: 56, letterSpacing: -3.4, color: PAPER },
});
