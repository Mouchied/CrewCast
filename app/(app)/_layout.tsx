import { Tabs } from 'expo-router';
import { Colors } from '../../constants/Colors';

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
          tabBarIcon: ({ color }) => (
            <TabIcon name="grid" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs/index"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => (
            <TabIcon name="briefcase" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs/new"
        options={{
          title: 'New Job',
          tabBarIcon: ({ color }) => (
            <TabIcon name="plus-circle" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="log/new"
        options={{ href: null }}
      />
    </Tabs>
  );
}

// Inline icon component using unicode characters (no native dependency)
function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    grid: '⊞',
    briefcase: '💼',
    'plus-circle': '＋',
  };
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, color }}>{icons[name] ?? '•'}</Text>;
}
