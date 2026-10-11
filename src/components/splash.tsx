import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { font } from '@/lib/theme';

const INK = '#0e0e10';
const PAPER = '#f7f7f5';
const PURPLE = '#704af8';

export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduce = useReducedMotion();
  const out = useSharedValue(0);

  useEffect(() => {
    if (!ready) return;
    out.value = withDelay(reduce ? 150 : 900, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }, (ok) => {
      if (ok) scheduleOnRN(onDone);
    }));
  }, [ready, reduce, out, onDone]);

  const wrap = useAnimatedStyle(() => ({ opacity: 1 - out.value }));
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: reduce ? 1 : 1 + out.value * 0.06 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { pointerEvents: 'none' }, wrap]}>
      <Animated.View style={[styles.row, mark]}>
        {'Kakei'.split('').map((ch, i) => (
          <Animated.View key={i} entering={reduce ? undefined : FadeInDown.delay(80 + i * 55).duration(420).easing(Easing.out(Easing.exp))}>
            <Text style={styles.word}>{ch}</Text>
          </Animated.View>
        ))}
        <Animated.View entering={reduce ? undefined : ZoomIn.delay(440).springify().damping(10).stiffness(220)}>
          <Text style={[styles.word, { color: PURPLE }]}>.</Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: INK, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  word: { fontFamily: font.display, fontSize: 56, letterSpacing: -3.4, color: PAPER },
});
