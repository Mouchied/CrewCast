import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors } from '../../constants/Colors';

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 19, color }}>{icon}</Text>;
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.bgCard,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 24,
          paddingTop: 10,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <TabIcon icon="▦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="jobs/index"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <TabIcon icon="⬡" color={color} />,
        }}
      />
      <Tabs.Screen
        name="benchmarks"
        options={{
          title: 'Benchmarks',
          tabBarIcon: ({ color }) => <TabIcon icon="◈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon icon="⚙" color={color} />,
        }}
      />
      {/* Hidden screens — navigated to via router.push */}
      <Tabs.Screen name="jobs/new"  options={{ href: null }} />
      <Tabs.Screen name="jobs/[id]" options={{ href: null }} />
      <Tabs.Screen name="log/new"   options={{ href: null }} />
    </Tabs>
  );
}
