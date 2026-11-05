import { useIsFocused } from 'expo-router';
import React, { useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* Geometry on a 200 × 380 canvas. */
const VB_W = 200;
const VB_H = 380;
const BOTTOM = 360;
const TOP_FULL = 104; // water surface when the goal is reached
const BODY =
  'M80 60 L120 60 L120 72 C120 90 172 98 172 132 L172 330 Q172 362 140 362 L60 362 Q28 362 28 330 L28 132 C28 98 80 90 80 72 Z';

const TWO_PI = Math.PI * 2;

function wavePath(level: number, phase: number, amplitude: number, wavelength: number, offset: number): string {
  'worklet';
  const clamped = Math.min(Math.max(level, 0), 1);
  if (clamped <= 0.001) return `M0 ${VB_H} L${VB_W} ${VB_H} Z`;
  const y0 = BOTTOM - clamped * (BOTTOM - TOP_FULL);
  // Calmer surface when nearly empty or full.
  const amp = amplitude * Math.min(1, clamped * 6, (1.04 - clamped) * 6 + 0.35);
  let d = `M0 ${y0 + amp * Math.sin(phase + offset)}`;
  for (let x = 8; x <= VB_W; x += 8) {
    const y = y0 + amp * Math.sin((x / wavelength) * TWO_PI + phase + offset);
    d += ` L${x} ${y.toFixed(2)}`;
  }
  return `${d} L${VB_W} ${VB_H} L0 ${VB_H} Z`;
}

interface Props {
  /** consumed / goal; values above 1 render as a full bottle. */
  progress: number;
  goalReached: boolean;
  width?: number;
  label?: string;
  sublabel?: string;
}

export function WaterBottle({ progress, goalReached, width = 190, label, sublabel }: Props) {
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const level = useSharedValue(0);
  const phase = useSharedValue(0);
  const bubble = useSharedValue(0);

  // Fill level follows real progress with a soft spring.
  useEffect(() => {
    const target = Math.min(Math.max(progress, 0), 1);
    level.value = reduceMotion
      ? withTiming(target, { duration: 250 })
      : withSpring(target, { damping: 16, stiffness: 70, mass: 1 });
  }, [progress, reduceMotion, level]);

  // Waves only animate while the screen is visible and the app is active (battery).
  useEffect(() => {
    const start = () => {
      if (reduceMotion || !focused) return;
      phase.value = 0;
      phase.value = withRepeat(withTiming(TWO_PI, { duration: 3800, easing: Easing.linear }), -1, false);
      bubble.value = 0;
      bubble.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad) }), -1, false);
    };
    const stop = () => {
      cancelAnimation(phase);
      cancelAnimation(bubble);
    };
    start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [focused, reduceMotion, phase, bubble]);

  const backWave = useAnimatedProps(() => ({ d: wavePath(level.value, -phase.value, 5, 150, 1.4) }));
  const frontWave = useAnimatedProps(() => ({ d: wavePath(level.value, phase.value, 6, 120, 0) }));

  const bubbleA = useAnimatedProps(() => {
    const surface = BOTTOM - Math.min(level.value, 1) * (BOTTOM - TOP_FULL);
    const span = Math.max(0, BOTTOM - 16 - surface - 16);
    const t = bubble.value;
    return { cy: BOTTOM - 16 - span * t, opacity: level.value > 0.12 ? 0.55 * (1 - t) : 0 };
  });
  const bubbleB = useAnimatedProps(() => {
    const surface = BOTTOM - Math.min(level.value, 1) * (BOTTOM - TOP_FULL);
    const span = Math.max(0, BOTTOM - 24 - surface - 20);
    const t = (bubble.value + 0.45) % 1;
    return { cy: BOTTOM - 24 - span * t, opacity: level.value > 0.12 ? 0.45 * (1 - t) : 0 };
  });

  const height = (width * VB_H) / VB_W;
  const textOnWater = progress >= 0.5;

  return (
    <View
      style={{ width, height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Water bottle ${Math.round(Math.min(progress, 9.99) * 100)} percent full${goalReached ? ', daily goal reached' : ''}`}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Defs>
          <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={goalReached ? '#5EEAD4' : colors.waterLight} />
            <Stop offset="0.55" stopColor={goalReached ? colors.waterGoal : colors.water} />
            <Stop offset="1" stopColor={goalReached ? '#0891B2' : colors.waterDeep} />
          </LinearGradient>
          <LinearGradient id="waterBack" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={goalReached ? '#99F6E4' : '#BAE6FD'} />
            <Stop offset="1" stopColor={goalReached ? '#22D3EE' : '#7DD3FC'} />
          </LinearGradient>
          <LinearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="0.5" stopColor="#F0F9FF" stopOpacity="0.7" />
            <Stop offset="1" stopColor="#E0F2FE" stopOpacity="0.95" />
          </LinearGradient>
          <LinearGradient id="cap" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={goalReached ? '#2DD4BF' : '#38BDF8'} />
            <Stop offset="1" stopColor={goalReached ? '#0D9488' : '#0284C7'} />
          </LinearGradient>
          <RadialGradient id="glow" cx="50%" cy="55%" r="50%">
            <Stop offset="0" stopColor={colors.cyan} stopOpacity="0.35" />
            <Stop offset="1" stopColor={colors.cyan} stopOpacity="0" />
          </RadialGradient>
          <ClipPath id="bodyClip">
            <Path d={BODY} />
          </ClipPath>
        </Defs>

        {goalReached && <Rect x="-20" y="40" width="240" height="340" fill="url(#glow)" />}

        {/* Glass body */}
        <Path d={BODY} fill="url(#glass)" />

        {/* Water */}
        <G clipPath="url(#bodyClip)">
          <AnimatedPath animatedProps={backWave} fill="url(#waterBack)" opacity={0.75} />
          <AnimatedPath animatedProps={frontWave} fill="url(#water)" />
          <AnimatedCircle animatedProps={bubbleA} cx={70} r={4} fill="#FFFFFF" />
          <AnimatedCircle animatedProps={bubbleB} cx={128} r={3} fill="#FFFFFF" />
        </G>

        {/* Measurement ticks */}
        {[0.25, 0.5, 0.75].map((t) => {
          const y = BOTTOM - t * (BOTTOM - TOP_FULL);
          return <Rect key={t} x={150} y={y - 1} width={t === 0.5 ? 14 : 9} height={2} rx={1} fill="#0369A1" opacity={0.18} />;
        })}

        {/* Highlights */}
        <Rect x={42} y={140} width={10} height={170} rx={5} fill="#FFFFFF" opacity={0.55} />
        <Rect x={42} y={322} width={10} height={14} rx={5} fill="#FFFFFF" opacity={0.45} />

        {/* Outline */}
        <Path d={BODY} fill="none" stroke="#9BD7F5" strokeWidth={3.5} strokeLinejoin="round" />

        {/* Cap */}
        <Rect x={72} y={14} width={56} height={44} rx={10} fill="url(#cap)" />
        {[24, 32, 40, 48].map((y) => (
          <Rect key={y} x={78} y={y} width={44} height={2.2} rx={1.1} fill="#FFFFFF" opacity={0.28} />
        ))}
        <Rect x={68} y={52} width={64} height={10} rx={5} fill={goalReached ? '#0F766E' : '#0369A1'} />
      </Svg>

      {label ? (
        <View style={styles.labelWrap} pointerEvents="none">
          <Text style={[styles.label, textOnWater ? styles.onWater : { color: colors.primaryDark }]}>{label}</Text>
          {sublabel ? (
            <Text style={[styles.sublabel, { color: textOnWater ? '#E0F7FF' : colors.textMuted }]}>{sublabel}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelWrap: { position: 'absolute', left: 0, right: 0, top: '58%', alignItems: 'center' },
  label: { fontSize: 40, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  sublabel: { fontSize: 13, fontWeight: '600', marginTop: -2 },
  onWater: { color: '#FFFFFF', textShadowColor: 'rgba(3, 105, 161, 0.35)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
});
