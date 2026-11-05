import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../../components/Icon';
import { sourceIcon, sourceLabel } from '../../components/sources';
import { Backdrop, Card } from '../../components/ui';
import * as db from '../../db/database';
import { addDays, dayKey, formatClock, formatDayLabel, shortWeekday, startOfDay } from '../../domain/dates';
import { formatVolume, progressFraction } from '../../domain/format';
import type { DaySummary, IntakeEntry } from '../../domain/types';
import { useApp } from '../../state/AppStore';
import { colors, radius, spacing, type } from '../../theme';

const PAGE_DAYS = 14;

interface Section {
  day: string;
  summary: DaySummary;
  data: IntakeEntry[];
}

export default function History() {
  const { revision, settings, deleteEntry } = useApp();
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [entries, setEntries] = useState<Record<string, IntakeEntry[]>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<{ day: string; total: number }[]>([]);
  const [lifetime, setLifetime] = useState({ totalMl: 0, days: 0, entries: 0 });
  const loadingMore = useRef(false);
  const loadedCount = useRef(0);

  const loadRange = useCallback(async (offset: number, limit: number) => {
    const page = await db.getDaySummaries(limit, offset);
    let grouped: Record<string, IntakeEntry[]> = {};
    if (page.length > 0) {
      const rows = await db.getEntriesBetween(page[page.length - 1].day, page[0].day);
      grouped = rows.reduce<Record<string, IntakeEntry[]>>((acc, e) => {
        (acc[e.day] ??= []).push(e);
        return acc;
      }, {});
    }
    return { page, grouped };
  }, []);

  // (Re)load from the top whenever history changes.
  useEffect(() => {
    let alive = true;
    (async () => {
      const limit = Math.max(PAGE_DAYS, loadedCount.current);
      const [{ page, grouped }, weekTotals, stats] = await Promise.all([
        loadRange(0, limit),
        (async () => {
          const today = startOfDay();
          const keys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(today, i - 6)));
          const totals = await db.getTotalsForDays(keys);
          return keys.map((day) => ({ day, total: totals[day] ?? 0 }));
        })(),
        db.getLifetimeStats(),
      ]);
      if (!alive) return;
      setSummaries(page);
      setEntries(grouped);
      setHasMore(page.length === limit);
      loadedCount.current = page.length;
      setWeek(weekTotals);
      setLifetime(stats);
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, [revision, loadRange]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const { page, grouped } = await loadRange(loadedCount.current, PAGE_DAYS);
      loadedCount.current += page.length;
      setSummaries((s) => [...s, ...page]);
      setEntries((e) => ({ ...e, ...grouped }));
      setHasMore(page.length === PAGE_DAYS);
    } finally {
      loadingMore.current = false;
    }
  }, [hasMore, loadRange]);

  const todayKey = dayKey();
  const goalFor = useCallback(
    (s: DaySummary) => (s.day === todayKey ? settings.goalMl : s.goalMl),
    [todayKey, settings.goalMl],
  );

  const sections = useMemo<Section[]>(
    () => summaries.map((s) => ({ day: s.day, summary: s, data: entries[s.day] ?? [] })),
    [summaries, entries],
  );

  const goalByDay = useMemo(() => Object.fromEntries(summaries.map((s) => [s.day, goalFor(s)])), [summaries, goalFor]);

  const confirmDelete = (e: IntakeEntry) => {
    Alert.alert('Remove this entry?', `${formatVolume(e.amountMl)} at ${formatClock(e.createdAt)} will be removed from your history.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteEntry(e.id) },
    ]);
  };

  const header = (
    <View>
      <Text style={type.hero}>History</Text>
      <Text style={[type.caption, { marginTop: 2 }]}>Every drink you’ve logged, kept on this device.</Text>
      <WeekCard week={week} goalByDay={goalByDay} fallbackGoal={settings.goalMl} />
      <View style={styles.lifetime}>
        <Lifetime label="All-time" value={formatVolume(lifetime.totalMl)} />
        <Lifetime label="Days tracked" value={String(lifetime.days)} />
        <Lifetime label="Drinks" value={String(lifetime.entries)} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          initialNumToRender={20}
          windowSize={7}
          renderSectionHeader={({ section }) => {
            const goal = goalFor(section.summary);
            const frac = Math.min(1, progressFraction(section.summary.totalMl, goal));
            const met = section.summary.totalMl >= goal;
            return (
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTop}>
                  <Text style={type.heading}>{formatDayLabel(section.day)}</Text>
                  <Text style={[type.caption, met && { color: '#0F766E', fontWeight: '700' }]}>
                    {formatVolume(section.summary.totalMl)} / {formatVolume(goal)}
                    {met ? '  ✓' : ''}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${frac * 100}%` }, met && { backgroundColor: colors.success }]} />
                </View>
              </View>
            );
          }}
          renderItem={({ item, index, section }) => (
            <Pressable
              onLongPress={() => confirmDelete(item)}
              delayLongPress={400}
              accessibilityHint="Long press to remove"
              style={({ pressed }) => [
                styles.item,
                index === 0 && styles.itemFirst,
                index === section.data.length - 1 && styles.itemLast,
                pressed && { backgroundColor: colors.surfaceTint },
              ]}
            >
              <View style={styles.itemIcon}>
                <Icon name={sourceIcon[item.source]} size={16} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>{formatClock(item.createdAt)}</Text>
                <Text style={[type.caption, { fontSize: 12 }]}>{sourceLabel[item.source]}</Text>
              </View>
              <Text style={[type.bodyStrong, { color: colors.primaryDark }]}>+{formatVolume(item.amountMl)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
            ) : (
              <Card style={{ marginTop: spacing.xl, alignItems: 'center' }}>
                <Icon name="drop" size={32} color={colors.waterLight} />
                <Text style={[type.heading, { marginTop: spacing.sm }]}>No drinks yet</Text>
                <Text style={[type.caption, { textAlign: 'center', marginTop: 4 }]}>
                  Tap your sticker to log your first glass. It will show up here.
                </Text>
              </Card>
            )
          }
          ListFooterComponent={
            hasMore && sections.length > 0 ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} /> : undefined
          }
        />
      </SafeAreaView>
    </View>
  );
}

function WeekCard({
  week,
  goalByDay,
  fallbackGoal,
}: {
  week: { day: string; total: number }[];
  goalByDay: Record<string, number>;
  fallbackGoal: number;
}) {
  const goals = week.map((w) => goalByDay[w.day] ?? fallbackGoal);
  const max = Math.max(1, ...week.map((w) => w.total), ...goals);
  const met = week.filter((w, i) => w.total >= goals[i] && w.total > 0).length;
  const avg = week.length ? week.reduce((s, w) => s + w.total, 0) / week.length : 0;
  const today = dayKey();
  return (
    <Card style={{ marginTop: spacing.lg }}>
      <View style={styles.weekTop}>
        <View>
          <Text style={type.micro}>LAST 7 DAYS</Text>
          <Text style={[type.number, { marginTop: 4 }]}>{formatVolume(avg)}</Text>
          <Text style={type.caption}>daily average</Text>
        </View>
        <View style={styles.metBadge}>
          <Text style={[type.bodyStrong, { color: '#0F766E' }]}>{met}/7</Text>
          <Text style={[type.caption, { fontSize: 11, color: '#0F766E' }]}>goals met</Text>
        </View>
      </View>
      <View style={styles.bars} accessibilityLabel={`Last 7 days, average ${formatVolume(avg)}`}>
        {week.map((w, i) => {
          const h = Math.max(4, (w.total / max) * 96);
          const reached = w.total >= goals[i] && w.total > 0;
          return (
            <View key={w.day} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: h }, reached && { backgroundColor: colors.success }, w.total === 0 && { backgroundColor: colors.border }]} />
              </View>
              <Text style={[type.micro, w.day === today && { color: colors.primaryDark }]}>{shortWeekday(w.day)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Lifetime({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.lifeItem}>
      <Text style={[type.bodyStrong, { fontSize: 16 }]}>{value}</Text>
      <Text style={[type.caption, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.xl - 4, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  weekTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  metBadge: { backgroundColor: colors.successSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  bars: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, height: 118, alignItems: 'flex-end' },
  barCol: { alignItems: 'center', flex: 1, gap: 6 },
  barTrack: { height: 96, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 9, backgroundColor: colors.water },
  lifetime: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  lifeItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  sectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.primarySoft, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.water },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  itemFirst: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, borderTopWidth: StyleSheet.hairlineWidth },
  itemLast: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, borderBottomWidth: StyleSheet.hairlineWidth },
  itemIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
