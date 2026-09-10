import { View } from 'react-native';
import { usePathname } from 'expo-router';
import AppTabs from '../../components/app-tabs';
import { QuickActions } from '../../modules/quickActions/QuickActions';
export default function TabsLayout(){const path=usePathname();return <View style={{flex:1}}><AppTabs/><QuickActions key={path}/></View>;}
