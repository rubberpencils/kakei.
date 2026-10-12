import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/input';
import { Avatar, goBack, Icon, Press, TxnRow, useDark, usePalette } from '@/components/ui';
import { inr } from '@/lib/format';
import { personName, pocket } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font, tagColors } from '@/lib/theme';

export default function Search() {
  const c = usePalette();
  const isDark = useDark();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [raw, setRaw] = useState('');
  const q = raw.trim().toLowerCase();
  const tagOnly = q.startsWith('#') ? q.slice(1) : null;
  const num = Number(q.replace(/[₹,\s]/g, ''));
  const groupName = (id: string | null) => (id ? store.groups.find((g) => g.id === id)?.name ?? '' : '');

  const expenses = !q
    ? []
    : store.expenses
      .filter((e) => {
        if (tagOnly !== null) return (e.tag ?? '').startsWith(tagOnly);
        return (
          e.merchant.toLowerCase().includes(q) ||
          (e.tag ?? '').includes(q) ||
          groupName(e.groupId).toLowerCase().includes(q) ||
          (e.payerId ? personName(store.people, store.you, e.payerId).toLowerCase().includes(q) : false) ||
          (e.bank ?? '').toLowerCase().includes(q) ||
          (num > 0 && Math.abs(e.amount - num) < 1)
        );
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  const spent = expenses.reduce((sum, e) => sum + pocket(e, store.you.id), 0);
  const people = q && tagOnly === null ? store.people.filter((p) => p.name.toLowerCase().includes(q)) : [];
  const groups = q && tagOnly === null ? store.groups.filter((g) => g.name.toLowerCase().includes(q)) : [];

  const used = new Map<string, number>();
  for (const e of store.expenses) if (e.tag) used.set(e.tag, (used.get(e.tag) ?? 0) + 1);
  const topTags = [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  const nothing = q && !expenses.length && !people.length && !groups.length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24 }}>
        <View style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: c.sub, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
          <Icon name="magnify" size={20} color={c.mut} />
          <Input
            value={raw}
            onChangeText={setRaw}
            autoFocus
            placeholder="Merchant, #tag, person, group or amount"
            label="Search"
            caps="none"
            style={{ flex: 1, fontFamily: font.body, fontSize: 15, color: c.fg, padding: 0 }}
          />
          {raw ? (
            <Press onPress={() => setRaw('')} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close-circle" size={18} color={c.mut} />
            </Press>
          ) : null}
        </View>
        <Press onPress={goBack} style={{ height: 44, paddingHorizontal: 6, justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>Cancel</Text>
        </Press>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 40 }}>
        {!q ? (
          <>
            {topTags.length ? (
              <>
                <Heading>Your tags</Heading>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {topTags.map((t) => {
                    const col = tagColors(t, isDark);
                    return (
                      <Press key={t} onPress={() => setRaw(`#${t}`)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: col.bg, justifyContent: 'center' }}>
                        <Text style={{ fontFamily: font.medium, fontSize: 13, color: col.fg }}>#{t}</Text>
                      </Press>
                    );
                  })}
                </View>
              </>
            ) : null}
            {store.people.length ? (
              <>
                <Heading>People</Heading>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
                  {store.people.map((p) => (
                    <Press key={p.id} onPress={() => router.push({ pathname: '/person/[id]', params: { id: p.id } })} style={{ alignItems: 'center', width: 56 }}>
                      <Avatar id={p.id} label={p.initials} size={44} />
                      <Text style={{ fontFamily: font.medium, fontSize: 12, color: c.fg, marginTop: 6 }} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                    </Press>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <Text style={{ fontFamily: font.body, fontSize: 13, lineHeight: 19, color: c.mut, marginTop: 28 }}>
              Try a merchant like Swiggy, a tag like #food, a friend, a group, or an amount like 450.
            </Text>
          </>
        ) : null}

        {people.length || groups.length ? (
          <View style={{ marginTop: 20 }}>
            {people.map((p) => (
              <Press key={p.id} onPress={() => router.push({ pathname: '/person/[id]', params: { id: p.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <Avatar id={p.id} label={p.initials} size={36} />
                <Text style={{ flex: 1, fontFamily: font.medium, fontSize: 15, color: c.fg }}>{p.name}</Text>
                <Icon name="chevron-right" size={18} color={c.mut} />
              </Press>
            ))}
            {groups.map((g) => (
              <Press key={g.id} onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={g.icon} size={19} />
                </View>
                <Text style={{ flex: 1, fontFamily: font.medium, fontSize: 15, color: c.fg }}>{g.name}</Text>
                <Icon name="chevron-right" size={18} color={c.mut} />
              </Press>
            ))}
          </View>
        ) : null}

        {expenses.length ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, marginBottom: 4 }}>
              <Text style={{ fontFamily: font.displaySm, fontSize: 17, color: c.fg }}>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</Text>
              {spent > 0 ? <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.mut }}>₹{inr(spent)} spent by you</Text> : null}
            </View>
            {expenses.slice(0, 80).map((e) => <TxnRow key={e.id} item={e} />)}
            {expenses.length > 80 ? <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 12 }}>Showing the latest 80. Narrow the search to see older ones.</Text> : null}
          </>
        ) : null}

        {nothing ? (
          <View style={{ alignItems: 'center', paddingTop: 56 }}>
            <Icon name="text-search" size={30} color={c.mut} />
            <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg, marginTop: 10 }}>Nothing matches “{raw.trim()}”</Text>
            <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 4 }}>Check the spelling, or search a tag with #.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Heading({ children }: { children: string }) {
  const c = usePalette();
  return <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.mut, marginTop: 24, marginBottom: 10 }}>{children}</Text>;
}
