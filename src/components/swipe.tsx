import { createContext, useContext, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInLeft, FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { buzz } from '@/components/ui';

// Which way the last change went: 1 moved forward through the tabs, -1 moved back.
const Dir = createContext(1);

/**
 * Lets a page change tab by swiping sideways, the same as tapping the switcher at the top. Wrap the whole page, keep
 * the switcher where it is, and put the part that changes inside <SwipeBody>. A mostly vertical drag still scrolls.
 */
export function SwipeTabs<T extends string>({ order, value, onChange, children }: { order: readonly T[]; value: T; onChange: (v: T) => void; children: ReactNode }) {
  const idx = Math.max(0, order.indexOf(value));
  // Remember which way we moved, so the new tab can arrive from that side. Tapping the switcher counts too.
  const [seen, setSeen] = useState({ idx, dir: 1 });
  if (seen.idx !== idx) setSeen({ idx, dir: idx > seen.idx ? 1 : -1 });

  const go = (step: number) => {
    const next = order[idx + step];
    if (next === undefined) return;
    buzz();
    onChange(next);
  };

  return (
    <Dir.Provider value={seen.dir}>
      <SwipeArea onStep={go}>{children}</SwipeArea>
    </Dir.Provider>
  );
}

/** Calls onStep(1) on a swipe left and onStep(-1) on a swipe right. A mostly vertical drag still scrolls the page. */
export function SwipeArea({ onStep, children }: { onStep: (step: 1 | -1) => void; children: ReactNode }) {
  const pan = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > 56 || Math.abs(e.velocityX) > 700;
      if (far) scheduleOnRN(onStep, e.translationX < 0 ? 1 : -1);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}

/** The part of a page that changes with the tab. It slides in from the side you swiped toward. */
export function SwipeBody({ k, style, children }: { k: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const dir = useContext(Dir);
  const reduce = useReducedMotion();
  const enter = reduce ? FadeIn.duration(120) : (dir > 0 ? FadeInRight : FadeInLeft).duration(220);
  return (
    <Animated.View key={k} entering={enter} style={style}>
      {children}
    </Animated.View>
  );
}
